import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RABBITMQ_ROUTING_KEYS } from '../queue/queue.constants';
import { TranscriptParserUtil } from './transcript-parser.util';
import { IntelligenceService } from '../intelligence/intelligence.service';
import {
  UploadTranscriptDto,
  UploadAndCreateMeetingDto,
} from './dto/upload-transcript.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => IntelligenceService))
    private readonly intelligenceService: IntelligenceService,
  ) {}

  /**
   * Helper to ensure valid organization ID
   */
  private async resolveOrganizationId(
    user: AuthenticatedUser,
    userId: string,
  ): Promise<string> {
    if (user.organizationId) {
      return user.organizationId;
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId },
    });

    if (membership) {
      return membership.organizationId;
    }

    // Provision default organization if missing
    const org = await this.prisma.organization.create({
      data: {
        name: `${user.name || 'My'}'s Workspace`,
        slug: `workspace-${userId.slice(0, 8)}-${Date.now()}`,
        members: {
          create: {
            userId,
            role: 'OWNER',
          },
        },
      },
    });

    return org.id;
  }

  async findByMeetingId(meetingId: string) {
    const transcript = await this.prisma.transcript.findFirst({
      where: { meetingId },
      include: {
        segments: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!transcript) {
      throw new NotFoundException(
        `Transcript for meeting ${meetingId} not found`,
      );
    }

    return {
      ...transcript,
      segments: transcript.segments.map((s) => ({
        ...s,
        startTimeMs: s.startTimeMs ? Number(s.startTimeMs) : null,
        endTimeMs: s.endTimeMs ? Number(s.endTimeMs) : null,
      })),
    };
  }

  async findSegments(meetingId: string) {
    const transcript = await this.prisma.transcript.findFirst({
      where: { meetingId },
    });

    if (!transcript) {
      return [];
    }

    const segments = await this.prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'asc' },
    });

    return segments.map((s) => ({
      ...s,
      startTimeMs: s.startTimeMs ? Number(s.startTimeMs) : null,
      endTimeMs: s.endTimeMs ? Number(s.endTimeMs) : null,
    }));
  }

  /**
   * Uploads and parses transcript for an existing meeting
   */
  async uploadForMeeting(
    meetingId: string,
    dto: UploadTranscriptDto,
    user: AuthenticatedUser,
  ) {
    const userId = user.userId || (user as any).id || (user as any).sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid user context');
    }

    const organizationId = await this.resolveOrganizationId(user, userId);

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id: meetingId,
        organizationId,
      },
    });

    if (!meeting) {
      throw new NotFoundException(
        `Meeting ${meetingId} not found in your organization`,
      );
    }

    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Transcript content cannot be empty');
    }

    try {
      // 1. Parse content
      const parsed = TranscriptParserUtil.parse(
        dto.content,
        dto.mimeType,
        dto.filename,
      );

      if (parsed.segments.length === 0) {
        throw new BadRequestException(
          'Could not parse any transcript segments from the provided content',
        );
      }

      // 2. Clear previous transcript & segments if re-uploading
      await this.prisma.transcript.deleteMany({
        where: { meetingId },
      });

      // 3. Create Transcript & nested Segments
      const transcript = await this.prisma.transcript.create({
        data: {
          meetingId,
          source: parsed.source || 'UPLOAD',
          language: parsed.language || 'en',
          status: 'READY',
          version: 1,
          segments: {
            create: parsed.segments.map((seg) => ({
              sequence: seg.sequence,
              speakerName: seg.speakerName || null,
              text: seg.text,
              startTimeMs: seg.startTimeMs,
              endTimeMs: seg.endTimeMs,
            })),
          },
        },
      });

      // 4. Update meeting status to TRANSCRIPT_RECEIVED
      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'TRANSCRIPT_RECEIVED',
          updatedAt: new Date(),
        },
      });

      // 5. Create processing job in DB
      const processingJob = await this.prisma.processingJob.create({
        data: {
          meetingId,
          jobType: 'INTELLIGENCE',
          status: 'QUEUED',
        },
      });

      // 6. Trigger background AI pipeline via RabbitMQ
      try {
        await this.queueService.publishJob(
          RABBITMQ_ROUTING_KEYS.INTELLIGENCE,
          {
            jobId: processingJob.id,
            meetingId,
            transcriptId: transcript.id,
            organizationId,
            segmentsCount: parsed.segments.length,
            language: parsed.language,
          },
          {
            messageId: `job-${processingJob.id}`,
            correlationId: meetingId,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(`Could not dispatch RabbitMQ job: ${queueErr.message}`);
      }

      // Process intelligence immediately
      try {
        await this.intelligenceService.processMeetingIntelligence(meetingId);
      } catch (procErr: any) {
        this.logger.warn(`Immediate intelligence processing note: ${procErr.message}`);
      }

      this.logger.log(
        `Transcript uploaded and intelligence generated for meeting ${meetingId} (${parsed.segments.length} segments).`,
      );

      return {
        message: 'Transcript uploaded and AI intelligence processed',
        meetingId,
        transcriptId: transcript.id,
        segmentsCount: parsed.segments.length,
        source: parsed.source,
        status: 'COMPLETED',
      };
    } catch (error: any) {
      this.logger.error(`Failed to upload transcript: ${error.message}`, error.stack);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to upload transcript: ${error.message}`);
    }
  }

  /**
   * Creates a new meeting and attaches the uploaded transcript in a single step
   */
  async uploadAndCreateMeeting(
    dto: UploadAndCreateMeetingDto,
    user: AuthenticatedUser,
  ) {
    const userId = user.userId || (user as any).id || (user as any).sub;
    if (!userId) {
      throw new UnauthorizedException('Invalid user context');
    }

    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Transcript content cannot be empty');
    }

    const organizationId = await this.resolveOrganizationId(user, userId);

    // Determine meeting title from DTO, filename, or default
    let meetingTitle = dto.title;
    if (!meetingTitle && dto.filename) {
      meetingTitle = dto.filename
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!meetingTitle) {
      meetingTitle = `Uploaded Transcript - ${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    }

    try {
      // 1. Parse transcript
      const parsed = TranscriptParserUtil.parse(
        dto.content,
        dto.mimeType,
        dto.filename,
      );

      if (parsed.segments.length === 0) {
        throw new BadRequestException(
          'Could not parse any transcript segments from the provided content',
        );
      }

      // 2. Create Meeting
      const meeting = await this.prisma.meeting.create({
        data: {
          organizationId,
          createdBy: userId,
          title: meetingTitle,
          description: dto.description || `Ingested from ${dto.filename || parsed.source}`,
          status: 'TRANSCRIPT_RECEIVED',
          source: 'MANUAL',
          provider: 'MANUAL',
          startTime: new Date(),
        },
      });

      // 3. Create Transcript and Segments
      const transcript = await this.prisma.transcript.create({
        data: {
          meetingId: meeting.id,
          source: parsed.source || 'UPLOAD',
          language: parsed.language || 'en',
          status: 'READY',
          version: 1,
          segments: {
            create: parsed.segments.map((seg) => ({
              sequence: seg.sequence,
              speakerName: seg.speakerName || null,
              text: seg.text,
              startTimeMs: seg.startTimeMs,
              endTimeMs: seg.endTimeMs,
            })),
          },
        },
      });

      // 4. Create Processing Job in DB
      const processingJob = await this.prisma.processingJob.create({
        data: {
          meetingId: meeting.id,
          jobType: 'INTELLIGENCE',
          status: 'QUEUED',
        },
      });

      // 5. Trigger background AI pipeline via RabbitMQ
      try {
        await this.queueService.publishJob(
          RABBITMQ_ROUTING_KEYS.INTELLIGENCE,
          {
            jobId: processingJob.id,
            meetingId: meeting.id,
            transcriptId: transcript.id,
            organizationId,
            segmentsCount: parsed.segments.length,
            language: parsed.language,
          },
          {
            messageId: `job-${processingJob.id}`,
            correlationId: meeting.id,
          },
        );
      } catch (queueErr: any) {
        this.logger.warn(`Could not dispatch RabbitMQ job: ${queueErr.message}`);
      }

      // Process intelligence immediately
      try {
        await this.intelligenceService.processMeetingIntelligence(meeting.id);
      } catch (procErr: any) {
        this.logger.warn(`Immediate intelligence processing note: ${procErr.message}`);
      }

      this.logger.log(
        `Created new meeting ${meeting.id} ("${meetingTitle}") with ${parsed.segments.length} transcript segments and intelligence generated.`,
      );

      return {
        message: 'Meeting created and AI intelligence processed',
        meeting: {
          id: meeting.id,
          title: meeting.title,
          status: 'COMPLETED',
        },
        transcriptId: transcript.id,
        segmentsCount: parsed.segments.length,
        source: parsed.source,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create meeting and transcript: ${error.message}`, error.stack);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(`Failed to process transcript: ${error.message}`);
    }
  }
}
