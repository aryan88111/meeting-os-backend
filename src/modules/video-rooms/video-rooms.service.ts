import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RABBITMQ_ROUTING_KEYS } from '../queue/queue.constants';
import { IntelligenceService } from '../intelligence/intelligence.service';
import {
  GenerateRoomTokenDto,
  IngestLiveCaptionDto,
  GenerateGuestTokenDto,
  AddParticipantDto,
} from './dto/video-rooms.dto';

import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class VideoRoomsService {
  private readonly logger = new Logger(VideoRoomsService.name);
  private roomService: RoomServiceClient | null = null;
  private webhookReceiver: WebhookReceiver | null = null;
  private readonly livekitHost: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => IntelligenceService))
    private readonly intelligenceService: IntelligenceService,
  ) {
    this.livekitHost = this.configService.get<string>('LIVEKIT_HOST') || 'http://localhost:7880';
    this.apiKey = this.configService.get<string>('LIVEKIT_API_KEY') || 'meetingos_key';
    this.apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET') || 'meetingos_secret_livekit_key_2026_production_sfu';

    try {
      this.roomService = new RoomServiceClient(this.livekitHost, this.apiKey, this.apiSecret);
      this.webhookReceiver = new WebhookReceiver(this.apiKey, this.apiSecret);
      this.logger.log(`Initialized LiveKit SFU Client targeting host: ${this.livekitHost}`);
    } catch (err) {
      this.logger.warn(`Failed to initialize LiveKit RoomServiceClient: ${err.message}`);
    }
  }

  /**
   * Helper to resolve existing meeting by UUID/providerMeetingId or auto-provision an instant room
   */
  private async resolveMeeting(meetingId: string, user: AuthenticatedUser) {
    let meeting = await this.prisma.meeting.findFirst({
      where: {
        OR: [
          { id: meetingId },
          { providerMeetingId: meetingId },
          { meetingUrl: { contains: meetingId } },
        ],
      },
      include: {
        organization: true,
        roomSessions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        participants: true,
      },
    });

    if (!meeting) {
      let orgId = user.organizationId;
      if (!orgId) {
        const membership = await this.prisma.organizationMember.findFirst({
          where: { userId: user.userId },
        });
        orgId = membership?.organizationId || '';
      }

      if (!orgId) {
        const newOrg = await this.prisma.organization.create({
          data: {
            name: `${user.name || 'Personal'}'s Workspace`,
            slug: `org-${user.userId.slice(0, 8)}-${Date.now()}`,
            members: {
              create: {
                userId: user.userId,
                role: 'OWNER',
              },
            },
          },
        });
        orgId = newOrg.id;
      }

      meeting = await this.prisma.meeting.create({
        data: {
          organizationId: orgId,
          createdBy: user.userId,
          title: `Instant Meeting Room (${meetingId})`,
          provider: 'MEETINGOS_ROOM',
          source: 'MEETINGOS_ROOM',
          providerMeetingId: meetingId,
          meetingUrl: `/room/${meetingId}`,
          status: 'PROCESSING',
          startTime: new Date(),
        },
        include: {
          organization: true,
          roomSessions: true,
          participants: true,
        },
      });
      this.logger.log(`Auto-provisioned instant meeting ${meeting.id} for room identifier: ${meetingId}`);
    }

    return meeting;
  }

  /**
   * Generate a secure WebRTC token for joining a video call room
   */
  async generateJoinToken(
    meetingId: string,
    user: AuthenticatedUser,
    dto: GenerateRoomTokenDto,
  ) {
    const meeting = await this.resolveMeeting(meetingId, user);
    const resolvedMeetingId = meeting.id;

    // Verify user belongs to the meeting organization
    const isMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: meeting.organizationId,
        userId: user.userId,
      },
    });

    const userRole = isMember?.role || 'MEMBER';
    const roomName = `room-${resolvedMeetingId}`;
    const participantIdentity = user.userId;
    const participantName = dto.participantName || user.name || user.email.split('@')[0];

    // Ensure or update participant record
    await this.prisma.participant.create({
      data: {
        meetingId: resolvedMeetingId,
        name: participantName,
        email: user.email,
        role: userRole,
        isExternal: !isMember,
      },
    }).catch(() => {
      // Participant already recorded
    });

    // Create or find active RoomSession
    let roomSession = await this.prisma.roomSession.findFirst({
      where: {
        meetingId: resolvedMeetingId,
        isLive: true,
      },
    });

    if (!roomSession) {
      roomSession = await this.prisma.roomSession.create({
        data: {
          meetingId: resolvedMeetingId,
          roomName,
          activeParticipants: 1,
          isLive: true,
          startedAt: new Date(),
        },
      });

      await this.prisma.meeting.update({
        where: { id: resolvedMeetingId },
        data: {
          provider: 'MEETINGOS_ROOM',
          source: 'MEETINGOS_ROOM',
          status: 'PROCESSING',
          startTime: meeting.startTime || new Date(),
        },
      });
    }


    // Generate LiveKit JWT Access Token
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantIdentity,
      name: participantName,
      metadata: JSON.stringify({
        userId: user.userId,
        email: user.email,
        orgId: meeting.organizationId,
        role: isMember?.role || 'ATTENDEE',
      }),
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: dto.canPublish ?? true,
      canSubscribe: true,
      canPublishData: dto.canPublishData ?? true,
    });

    const token = await at.toJwt();

    return {
      token,
      serverUrl: this.livekitHost,
      roomName,
      meetingId: resolvedMeetingId,
      session: roomSession,
      participant: {
        identity: participantIdentity,
        name: participantName,
        email: user.email,
        role: userRole,
      },
    };
  }

  /**
   * Generate an instant guest token for external attendees without an account
   */
  async generateGuestToken(meetingId: string, dto: GenerateGuestTokenDto) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        OR: [
          { id: meetingId },
          { providerMeetingId: meetingId },
          { meetingUrl: { contains: meetingId } },
        ],
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const guestId = `guest_${Math.random().toString(36).substring(2, 10)}`;
    const guestName = dto.guestName.trim() || 'Guest Attendee';
    const roomName = `room-${meeting.id}`;

    // Record participant in meeting
    await this.prisma.participant.create({
      data: {
        meetingId: meeting.id,
        name: guestName,
        email: dto.guestEmail?.trim() || null,
        role: 'GUEST',
        isExternal: true,
      },
    }).catch(() => {});

    // Issue LiveKit guest token
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: guestId,
      name: guestName,
      metadata: JSON.stringify({
        userId: guestId,
        email: dto.guestEmail || '',
        orgId: meeting.organizationId,
        role: 'GUEST',
        isGuest: true,
      }),
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return {
      token,
      serverUrl: this.livekitHost,
      roomName,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      participant: {
        identity: guestId,
        name: guestName,
        email: dto.guestEmail || null,
        role: 'GUEST',
        isGuest: true,
      },
    };
  }

  /**
   * Add a new participant / invitee to a meeting
   */
  async addParticipant(meetingId: string, dto: AddParticipantDto) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        OR: [{ id: meetingId }, { providerMeetingId: meetingId }],
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const participant = await this.prisma.participant.create({
      data: {
        meetingId: meeting.id,
        name: dto.name.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        role: dto.role?.trim() || 'ATTENDEE',
        isExternal: true,
      },
    });

    return {
      status: 'participant_added',
      participant,
    };
  }


  /**
   * Get real-time status and active session of a meeting room
   */
  async getRoomStatus(meetingId: string, user: AuthenticatedUser) {
    const meeting = await this.resolveMeeting(meetingId, user);
    const resolvedMeetingId = meeting.id;

    const latestSession = meeting.roomSessions?.[0] || null;
    let livekitParticipants: any[] = [];

    if (latestSession && latestSession.isLive && this.roomService) {
      try {
        livekitParticipants = await this.roomService.listParticipants(latestSession.roomName);
      } catch (err) {
        this.logger.debug(`Could not query LiveKit server for active participants: ${err.message}`);
      }
    }

    return {
      meetingId: resolvedMeetingId,
      title: meeting.title,
      status: meeting.status,
      isLive: latestSession ? latestSession.isLive : false,
      activeParticipantsCount: livekitParticipants.length,
      participants: meeting.participants,
      session: latestSession,
    };
  }

  /**
   * Ingest a streaming live caption / final transcript segment
   */
  async ingestCaption(meetingId: string, dto: IngestLiveCaptionDto) {
    if (dto.isInterim) {
      // Interim transcripts are ephemeral for live UI display, not stored permanently in DB
      return { status: 'interim_acknowledged' };
    }

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        OR: [{ id: meetingId }, { providerMeetingId: meetingId }],
      },
    });
    const resolvedMeetingId = meeting ? meeting.id : meetingId;

    // Ensure transcript container exists
    let transcript = await this.prisma.transcript.findFirst({
      where: { meetingId: resolvedMeetingId },
    });

    if (!transcript) {
      transcript = await this.prisma.transcript.create({
        data: {
          meetingId: resolvedMeetingId,
          source: 'MEETINGOS_ROOM',
          language: 'en',
          status: 'IN_PROGRESS',
        },
      });
    }

    // Determine the next sequence number
    const lastSegment = await this.prisma.transcriptSegment.findFirst({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'desc' },
    });
    const nextSequence = (lastSegment?.sequence ?? 0) + 1;

    const safeStartMs =
      dto.startTimeMs !== undefined && dto.startTimeMs !== null && !isNaN(Number(dto.startTimeMs))
        ? BigInt(Math.max(0, Math.round(Number(dto.startTimeMs))))
        : null;
    const safeEndMs =
      dto.endTimeMs !== undefined && dto.endTimeMs !== null && !isNaN(Number(dto.endTimeMs))
        ? BigInt(Math.max(0, Math.round(Number(dto.endTimeMs))))
        : null;

    // Create the transcript segment
    const segment = await this.prisma.transcriptSegment.create({
      data: {
        transcriptId: transcript.id,
        speakerId: dto.speakerId,
        speakerName: dto.speakerName,
        text: dto.text.trim(),
        startTimeMs: safeStartMs,
        endTimeMs: safeEndMs,
        sequence: nextSequence,
      },
    });

    return {
      status: 'saved',
      segmentId: segment.id,
      sequence: segment.sequence,
    };
  }

  /**
   * Terminate call session and trigger post-meeting AI intelligence pipeline
   */
  async endCall(meetingId: string, user: AuthenticatedUser, reason?: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        OR: [{ id: meetingId }, { providerMeetingId: meetingId }],
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const resolvedMeetingId = meeting.id;
    const roomName = `room-${resolvedMeetingId}`;

    // Terminate LiveKit room if active
    if (this.roomService) {
      try {
        await this.roomService.deleteRoom(roomName);
        this.logger.log(`Deleted LiveKit room: ${roomName}`);
      } catch (err) {
        this.logger.debug(`LiveKit room ${roomName} already closed or not found: ${err.message}`);
      }
    }

    // Mark RoomSession as finished
    await this.prisma.roomSession.updateMany({
      where: {
        meetingId: resolvedMeetingId,
        isLive: true,
      },
      data: {
        isLive: false,
        endedAt: new Date(),
        metadata: { endReason: reason || 'Host ended call' },
      },
    });

    // Update transcript status to READY
    await this.prisma.transcript.updateMany({
      where: { meetingId: resolvedMeetingId },
      data: { status: 'READY' },
    });

    // Calculate meeting duration
    const startTime = meeting.startTime || new Date();
    const endTime = new Date();
    const durationSeconds = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 1000));

    await this.prisma.meeting.update({
      where: { id: resolvedMeetingId },
      data: {
        endTime,
        durationSeconds,
        status: 'TRANSCRIPT_RECEIVED',
      },
    });

    // Trigger AI Intelligence Pipeline
    await this.triggerPostCallIntelligence(resolvedMeetingId);

    return {
      status: 'call_ended',
      meetingId: resolvedMeetingId,
      durationSeconds,
      intelligenceTriggered: true,
    };
  }

  /**
   * Process incoming LiveKit Webhooks (e.g. room_finished, participant_joined)
   */

  async handleLiveKitWebhook(body: any, authHeader?: string) {
    if (!body) {
      return { received: true, ignored: true, reason: 'Empty payload' };
    }

    let event: any = body;

    if (typeof body === 'string') {
      try {
        event = JSON.parse(body);
      } catch {
        if (this.webhookReceiver && authHeader) {
          try {
            event = await this.webhookReceiver.receive(body, authHeader);
          } catch (err) {
            this.logger.warn(`Webhook signature verification notice: ${err.message}`);
          }
        }
      }
    }

    if (!event || typeof event !== 'object') {
      return { received: true, ignored: true, reason: 'Invalid event structure' };
    }

    const eventType = event.event;
    if (!eventType) {
      return { received: true, ignored: true, reason: 'No event property' };
    }

    const roomName = event.room?.name || '';
    this.logger.log(`Received LiveKit webhook event: ${eventType} for room: ${roomName}`);

    if (roomName.startsWith('room-')) {
      const meetingId = roomName.replace('room-', '');

      if (eventType === 'room_finished') {
        this.logger.log(`Room finished event received for meeting ${meetingId}. Triggering automated pipeline.`);
        
        await this.prisma.roomSession.updateMany({
          where: { meetingId, isLive: true },
          data: { isLive: false, endedAt: new Date() },
        });

        await this.prisma.transcript.updateMany({
          where: { meetingId },
          data: { status: 'READY' },
        });

        await this.prisma.meeting.update({
          where: { id: meetingId },
          data: { status: 'TRANSCRIPT_RECEIVED', endTime: new Date() },
        });

        await this.triggerPostCallIntelligence(meetingId);
      } else if (eventType === 'participant_joined') {
        await this.prisma.roomSession.updateMany({
          where: { meetingId, isLive: true },
          data: { activeParticipants: { increment: 1 } },
        });
      } else if (eventType === 'participant_left') {
        await this.prisma.roomSession.updateMany({
          where: { meetingId, isLive: true },
          data: { activeParticipants: { decrement: 1 } },
        });
      }
    }

    return { received: true };
  }

  /**
   * Asynchronously enqueue or execute the MeetingOS Intelligence pipeline
   */
  private async triggerPostCallIntelligence(meetingId: string) {
    try {
      this.logger.log(`Enqueueing AI intelligence job for meeting: ${meetingId}`);

      const queued = await this.queueService.publishJob(
        RABBITMQ_ROUTING_KEYS.INTELLIGENCE,
        {
          id: `job_intel_${meetingId}_${Date.now()}`,
          meetingId,
          jobType: 'INTELLIGENCE_EXTRACTION',
          organizationId: '',
          payload: { meetingId, triggeredBy: 'SFU_CALL_COMPLETED' },
          timestamp: new Date().toISOString(),
        },
      );

      if (!queued) {
        this.logger.log(`RabbitMQ dispatch unavailable, executing IntelligenceService directly for meeting: ${meetingId}`);
        // Asynchronous non-blocking invocation
        this.intelligenceService.processMeetingIntelligence(meetingId).catch((err) => {
          this.logger.error(`Error in direct intelligence processing: ${err.message}`, err.stack);
        });
      }
    } catch (err) {
      this.logger.error(`Failed to trigger post-call intelligence for meeting ${meetingId}: ${err.message}`, err.stack);
    }
  }

}
