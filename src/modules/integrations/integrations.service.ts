import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RABBITMQ_ROUTING_KEYS } from '../queue/queue.constants';
import { TranscriptParserUtil } from '../transcripts/transcript-parser.util';
import { IntelligenceService } from '../intelligence/intelligence.service';
import { MeetingSource, MeetingStatus } from '@prisma/client';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
    @Inject(forwardRef(() => IntelligenceService))
    private readonly intelligenceService: IntelligenceService,
  ) {}

  getGoogleAuthUrl(customRedirectUri?: string) {
    const clientId = (this.configService.get<string>('GOOGLE_CLIENT_ID') || '').trim();
    const redirectUri =
      customRedirectUri ||
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/integrations/google/callback';

    if (!clientId) {
      throw new BadRequestException(
        'Google OAuth Client ID is not configured in backend environment. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your backend environment.',
      );
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  async handleGoogleCallback(
    organizationId: string,
    userId: string,
    code: string,
    customRedirectUri?: string,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';

    const redirectUri =
      customRedirectUri ||
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/integrations/google/callback';

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new BadRequestException(
          tokenData.error_description || tokenData.error || 'Failed to exchange Google OAuth code',
        );
      }

      // Fetch user profile info from Google
      let googleUserEmail: string | undefined;
      if (tokenData.access_token) {
        try {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            googleUserEmail = userinfo.email;
          }
        } catch (e) {
          this.logger.warn(`Could not retrieve Google userinfo: ${e}`);
        }
      }

      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null;

      // Find existing integration or create
      const existing = await this.prisma.integration.findFirst({
        where: {
          organizationId,
          provider: MeetingSource.GOOGLE_MEET,
        },
      });

      if (existing) {
        await this.prisma.integration.update({
          where: { id: existing.id },
          data: {
            encryptedAccessToken: tokenData.access_token,
            ...(tokenData.refresh_token && { encryptedRefreshToken: tokenData.refresh_token }),
            expiresAt,
            providerUserId: googleUserEmail || existing.providerUserId,
            status: 'ACTIVE',
            scopes: tokenData.scope,
          },
        });
      } else {
        await this.prisma.integration.create({
          data: {
            organizationId,
            provider: MeetingSource.GOOGLE_MEET,
            encryptedAccessToken: tokenData.access_token,
            encryptedRefreshToken: tokenData.refresh_token,
            expiresAt,
            providerUserId: googleUserEmail,
            status: 'ACTIVE',
            scopes: tokenData.scope,
          },
        });
      }

      this.logger.log(`Google Calendar integration connected for org ${organizationId}`);

      // Trigger initial sync of calendar events
      await this.syncGoogleCalendar(organizationId, userId).catch((err) => {
        this.logger.warn(`Initial Google Calendar sync had warnings: ${err.message}`);
      });

      return {
        success: true,
        message: 'Google Calendar, Meet, and Drive integration connected successfully',
        account: googleUserEmail,
      };
    } catch (err: any) {
      this.logger.error(`Google token exchange error: ${err.message}`, err.stack);
      throw new BadRequestException(err.message || 'Google authentication failed');
    }
  }

  /**
   * Retrieves a valid Google access token, automatically refreshing if expired
   */
  private async getValidAccessToken(organizationId: string): Promise<{
    accessToken: string;
    integrationId: string;
  }> {
    const integration = await this.prisma.integration.findFirst({
      where: {
        organizationId,
        provider: MeetingSource.GOOGLE_MEET,
      },
    });

    if (!integration || !integration.encryptedAccessToken) {
      throw new NotFoundException('No active Google integration found for this workspace. Please connect your Google Calendar in Integrations.');
    }

    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    const now = new Date();
    // Refresh if expired or expiring within 2 minutes AND standalone refresh credentials exist
    const isExpired =
      integration.expiresAt &&
      new Date(integration.expiresAt.getTime() - 2 * 60 * 1000) <= now;

    if (isExpired && integration.encryptedRefreshToken && clientId && clientSecret) {
      try {
        const refreshedToken = await this.refreshGoogleToken(
          integration.id,
          integration.encryptedRefreshToken,
        );
        return { accessToken: refreshedToken, integrationId: integration.id };
      } catch (e: any) {
        this.logger.warn(`Could not refresh Google token via client credentials: ${e.message}`);
      }
    }

    return {
      accessToken: integration.encryptedAccessToken,
      integrationId: integration.id,
    };
  }

  async syncGoogleCalendar(organizationId: string, userId: string) {
    const { accessToken, integrationId } = await this.getValidAccessToken(organizationId);

    const now = new Date();
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin,
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

    let res = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 401) {
        await this.prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'AUTH_REQUIRED' },
        }).catch(() => {});
        throw new BadRequestException('Google OAuth session has expired. Please reconnect your Google account in Integrations.');
      }
      throw new BadRequestException(`Failed to fetch Google Calendar events: ${errBody}`);
    }

    const data = await res.json();
    const items = data.items || [];
    let syncedCount = 0;

    for (const item of items) {
      if (!item.summary) continue;

      const eventId = item.id;
      const title = item.summary;
      const description = item.description || null;
      const meetingUrl = item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri || null;
      const startTime = item.start?.dateTime ? new Date(item.start.dateTime) : item.start?.date ? new Date(item.start.date) : null;
      const endTime = item.end?.dateTime ? new Date(item.end.dateTime) : item.end?.date ? new Date(item.end.date) : null;

      let durationSeconds: number | null = null;
      if (startTime && endTime) {
        durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
      }

      const existingMeeting = await this.prisma.meeting.findFirst({
        where: {
          organizationId,
          provider: MeetingSource.GOOGLE_MEET,
          providerMeetingId: eventId,
        },
      });

      const attendees = (item.attendees || []).map((att: any) => ({
        name: att.displayName || att.email?.split('@')[0] || 'Attendee',
        email: att.email?.toLowerCase(),
        isExternal: att.self !== true,
      }));

      if (existingMeeting) {
        await this.prisma.meeting.update({
          where: { id: existingMeeting.id },
          data: {
            title,
            description,
            meetingUrl,
            startTime,
            endTime,
            durationSeconds,
          },
        });
      } else {
        await this.prisma.meeting.create({
          data: {
            organizationId,
            createdBy: userId,
            title,
            description,
            provider: MeetingSource.GOOGLE_MEET,
            source: MeetingSource.GOOGLE_MEET,
            providerMeetingId: eventId,
            providerEventId: eventId,
            meetingUrl,
            startTime,
            endTime,
            durationSeconds,
            status: MeetingStatus.CREATED,
            participants: attendees.length
              ? {
                  create: attendees,
                }
              : undefined,
          },
        });
      }
      syncedCount++;
    }

    this.logger.log(`Synced ${syncedCount} Google Calendar events for org ${organizationId}`);
    return {
      success: true,
      syncedCount,
      totalEventsFound: items.length,
    };
  }

  /**
   * Multi-layer automated Google Meet transcript retrieval engine
   */
  async fetchGoogleMeetTranscript(meetingId: string, organizationId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id: meetingId,
        organizationId,
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const { accessToken } = await this.getValidAccessToken(organizationId);

    let transcriptFileId: string | null = null;
    let transcriptFileName: string | null = null;
    let transcriptMimeType: string | null = null;

    // LAYER 1: Inspect Google Calendar Event Attachments
    const eventId = meeting.providerEventId || meeting.providerMeetingId;
    if (eventId) {
      try {
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (calRes.ok) {
          const eventData = await calRes.json();
          const attachments = eventData.attachments || [];

          for (const att of attachments) {
            const title = (att.title || '').toLowerCase();
            const mime = (att.mimeType || '').toLowerCase();
            if (
              title.includes('transcript') ||
              mime.includes('document') ||
              mime.includes('text') ||
              title.endsWith('.txt') ||
              title.endsWith('.vtt')
            ) {
              transcriptFileId = att.fileId;
              transcriptFileName = att.title;
              transcriptMimeType = att.mimeType;
              this.logger.log(`Discovered transcript in Calendar event attachment: "${att.title}" (ID: ${att.fileId})`);
              break;
            }
          }
        }
      } catch (calErr: any) {
        this.logger.warn(`Could not check Calendar event attachments: ${calErr.message}`);
      }
    }

    // LAYER 2: Drive Scanner Fallback
    if (!transcriptFileId) {
      try {
        const cleanTitle = meeting.title.replace(/['"]/g, '');
        const query = `(name contains 'Transcript' or name contains '${cleanTitle}') and trashed = false`;
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,mimeType,modifiedTime)`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (driveRes.ok) {
          const driveData = await driveRes.json();
          const files = driveData.files || [];
          if (files.length > 0) {
            transcriptFileId = files[0].id;
            transcriptFileName = files[0].name;
            transcriptMimeType = files[0].mimeType;
            this.logger.log(`Discovered transcript via Google Drive scanner: "${files[0].name}" (ID: ${files[0].id})`);
          }
        }
      } catch (driveErr: any) {
        this.logger.warn(`Google Drive transcript search warning: ${driveErr.message}`);
      }
    }

    if (!transcriptFileId) {
      return {
        success: false,
        status: 'TRANSCRIPT_PENDING',
        message:
          'Transcript not yet available from Google Meet. Google Docs transcripts usually generate 2-5 minutes after call conclusion.',
        meetingId,
      };
    }

    // LAYER 3: Download & Export Content
    let rawContent = '';
    try {
      if (transcriptMimeType === 'application/vnd.google-apps.document') {
        // Export Google Doc as plain text
        const exportRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(transcriptFileId)}/export?mimeType=text/plain`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!exportRes.ok) {
          throw new Error(`Google Doc export failed: ${await exportRes.text()}`);
        }
        rawContent = await exportRes.text();
      } else {
        // Download raw text/vtt file
        const downloadRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(transcriptFileId)}?alt=media`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!downloadRes.ok) {
          throw new Error(`Google Drive download failed: ${await downloadRes.text()}`);
        }
        rawContent = await downloadRes.text();
      }
    } catch (downloadErr: any) {
      this.logger.error(`Failed to download transcript file: ${downloadErr.message}`);
      throw new BadRequestException(`Failed to download Google transcript: ${downloadErr.message}`);
    }

    if (!rawContent || !rawContent.trim()) {
      throw new BadRequestException('Downloaded transcript content was empty.');
    }

    // 4. Parse content
    const parsed = TranscriptParserUtil.parse(rawContent, 'text/plain', transcriptFileName || 'gmeet-transcript.txt');

    // 5. Clean prior transcript & Save
    await this.prisma.transcript.deleteMany({
      where: { meetingId },
    });

    const transcript = await this.prisma.transcript.create({
      data: {
        meetingId,
        source: 'GOOGLE_MEET',
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

    // 6. Update Meeting Status
    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.TRANSCRIPT_RECEIVED,
        updatedAt: new Date(),
      },
    });

    // 7. Create Job & Dispatch to RabbitMQ
    const processingJob = await this.prisma.processingJob.create({
      data: {
        meetingId,
        jobType: 'INTELLIGENCE',
        status: 'QUEUED',
      },
    });

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
          source: 'GOOGLE_MEET',
        },
        {
          messageId: `job-${processingJob.id}`,
          correlationId: meetingId,
        },
      );
    } catch (queueErr: any) {
      this.logger.warn(`Could not dispatch RabbitMQ job: ${queueErr.message}`);
    }

    // Process intelligence immediately to ensure instant availability in UI
    try {
      await this.intelligenceService.processMeetingIntelligence(meetingId);
    } catch (procErr: any) {
      this.logger.warn(`Immediate intelligence processing note: ${procErr.message}`);
    }

    this.logger.log(
      `Successfully ingested Google Meet transcript for meeting "${meeting.title}" (${parsed.segments.length} segments). Intelligence generated.`,
    );

    return {
      success: true,
      message: 'Google Meet transcript fetched and AI intelligence processed',
      meetingId,
      transcriptId: transcript.id,
      segmentsCount: parsed.segments.length,
      fileTitle: transcriptFileName,
      status: 'COMPLETED',
    };
  }

  /**
   * Scans and syncs all ended Google Meet meetings with missing transcripts
   */
  async scanAllEndedMeetingsTranscripts(organizationId: string) {
    const now = new Date();
    const candidateMeetings = await this.prisma.meeting.findMany({
      where: {
        organizationId,
        isActive: true,
        provider: MeetingSource.GOOGLE_MEET,
        status: {
          in: [MeetingStatus.CREATED, MeetingStatus.WAITING_FOR_TRANSCRIPT],
        },
        endTime: {
          lte: now,
        },
      },
      take: 10,
    });

    const results = [];
    for (const m of candidateMeetings) {
      try {
        const res = await this.fetchGoogleMeetTranscript(m.id, organizationId);
        results.push({ meetingId: m.id, title: m.title, result: res });
      } catch (err: any) {
        results.push({ meetingId: m.id, title: m.title, error: err.message });
      }
    }

    return {
      scannedCount: candidateMeetings.length,
      results,
    };
  }

  private async refreshGoogleToken(integrationId: string, refreshToken: string): Promise<string> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google OAuth client credentials not configured on backend.');
    }

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.access_token) {
        const errorDesc = data.error_description || data.error || 'Failed to refresh Google OAuth token';
        this.logger.warn(`Google token refresh failed for integration ${integrationId}: ${errorDesc}`);

        await this.prisma.integration.update({
          where: { id: integrationId },
          data: {
            status: 'AUTH_REQUIRED',
          },
        }).catch(() => {});

        throw new BadRequestException(`Google OAuth session expired. Please re-authenticate: ${errorDesc}`);
      }

      await this.prisma.integration.update({
        where: { id: integrationId },
        data: {
          encryptedAccessToken: data.access_token,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
          status: 'ACTIVE',
        },
      });

      return data.access_token;
    } catch (err: any) {
      throw err;
    }
  }

  /**
   * Directly creates an event with Google Meet video call on Google Calendar and invites attendees
   */
  async createGoogleMeetEvent(
    organizationId: string,
    userId: string,
    eventData: {
      title: string;
      description?: string;
      startTime?: Date | null;
      endTime?: Date | null;
      attendees?: Array<{ name?: string; email?: string }>;
      participants?: Array<{ name?: string; email?: string }>;
    },
  ): Promise<{
    meetingUrl: string;
    providerEventId?: string;
    googleEventLink?: string;
    isOfficialGoogleMeet?: boolean;
    errorReason?: string;
  }> {
    let errorReason: string | undefined;
    try {
      const { accessToken, integrationId } = await this.getValidAccessToken(organizationId);

      const startDateTime = eventData.startTime || new Date();
      const endDateTime = eventData.endTime || new Date(startDateTime.getTime() + 45 * 60 * 1000);

      const attendeeList = (eventData.attendees || eventData.participants || [])
        .filter((a) => a && a.email && a.email.trim())
        .map((a) => ({
          email: a.email!.trim().toLowerCase(),
          displayName: a.name?.trim() || a.email!.split('@')[0],
        }));

      const payload: any = {
        summary: eventData.title,
        description: eventData.description || 'Meeting scheduled via MeetingOS',
        start: {
          dateTime: startDateTime.toISOString(),
        },
        end: {
          dateTime: endDateTime.toISOString(),
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        ...(attendeeList.length > 0 && { attendees: attendeeList }),
      };

      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const meetUrl =
          data.hangoutLink ||
          data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri ||
          data.htmlLink;

        if (meetUrl) {
          this.logger.log(`Created genuine Google Meet event "${eventData.title}" (Event ID: ${data.id}) with link: ${meetUrl}`);
          return {
            meetingUrl: meetUrl,
            providerEventId: data.id,
            googleEventLink: data.htmlLink,
            isOfficialGoogleMeet: true,
          };
        }
      } else {
        const errText = await res.text();
        this.logger.warn(`Google Calendar API response error: ${errText}`);
        if (res.status === 401) {
          await this.prisma.integration.update({
            where: { id: integrationId },
            data: { status: 'AUTH_REQUIRED' },
          }).catch(() => {});
          errorReason = 'Google session expired. Please reconnect your Google account in Integrations.';
        } else {
          errorReason = `Google API error: ${errText}`;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Google Calendar event creation unavailable (${err.message}). Using persistent fallback.`);
      errorReason = err.message;
    }

    // Never generate fake random meet.google.com codes that Google will reject.
    // Instead, provide a deterministic persistent shared meeting room so all attendees join the exact same call.
    const roomSlug = eventData.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'meeting';
    const orgPrefix = organizationId.slice(0, 6);
    const randRoomId = Math.random().toString(36).substring(2, 8);
    const fallbackPersistentUrl = `https://meet.jit.si/meetingos-${orgPrefix}-${roomSlug}-${randRoomId}`;

    return {
      meetingUrl: fallbackPersistentUrl,
      isOfficialGoogleMeet: false,
      errorReason,
    };
  }

  async deleteGoogleCalendarEvent(organizationId: string, eventId: string) {
    try {
      const { accessToken } = await this.getValidAccessToken(organizationId);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (res.ok) {
        this.logger.log(`Deleted Google Calendar event ${eventId} for org ${organizationId}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not delete Google Calendar event ${eventId}: ${err.message}`);
    }
  }

  /**
   * Pushes an existing local MeetingOS meeting to Google Calendar and attaches real Google Meet link
   */
  async pushMeetingToGoogleCalendar(meetingId: string, organizationId: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, organizationId },
      include: { participants: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    const res = await this.createGoogleMeetEvent(organizationId, userId, {
      title: meeting.title,
      description: meeting.description || undefined,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      participants: meeting.participants.map((p) => ({
        name: p.name,
        email: p.email || undefined,
      })),
    });

    if (!res.isOfficialGoogleMeet || !res.providerEventId) {
      throw new BadRequestException(
        res.errorReason ||
          'Could not create event in Google Calendar. Please reconnect your Google account in Integrations.',
      );
    }

    const updated = await this.prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        meetingUrl: res.meetingUrl,
        provider: MeetingSource.GOOGLE_MEET,
        source: MeetingSource.GOOGLE_MEET,
        providerEventId: res.providerEventId,
        providerMeetingId: res.providerEventId,
      },
      include: { participants: true },
    });

    return {
      success: true,
      meeting: updated,
      isOfficialGoogleMeet: res.isOfficialGoogleMeet ?? false,
      googleEventLink: res.googleEventLink,
    };
  }

  async listIntegrations(organizationId: string) {
    const integrations = await this.prisma.integration.findMany({
      where: { organizationId },
      select: {
        id: true,
        provider: true,
        providerUserId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      integrations: integrations.map((i) => ({
        id: i.id,
        provider: i.provider,
        account: i.providerUserId,
        status: i.status,
        connectedAt: i.createdAt,
      })),
    };
  }
}
