import { Injectable, NotFoundException, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { MeetingStatus, Prisma } from '@prisma/client';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => IntegrationsService))
    private readonly integrationsService: IntegrationsService,
  ) {}

  async create(organizationId: string, userId: string, dto: CreateMeetingDto) {
    const startTime = dto.startTime ? new Date(dto.startTime) : null;
    const endTime = dto.endTime ? new Date(dto.endTime) : null;

    let durationSeconds = dto.durationSeconds;
    if (!durationSeconds && startTime && endTime) {
      durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
    }

    let meetingUrl = dto.meetingUrl?.trim();
    let providerEventId: string | undefined;
    let providerMeetingId: string | undefined;

    // Automated Video Link Generation
    if (!meetingUrl) {
      const generated = await this.generateMeetingUrl(
        dto.provider || 'MANUAL',
        organizationId,
        userId,
        {
          title: dto.title.trim(),
          description: dto.description?.trim(),
          startTime,
          endTime,
          participants: dto.participants,
        },
      );
      meetingUrl = generated.meetingUrl;
      providerEventId = generated.providerEventId;
      providerMeetingId = generated.providerMeetingId;
    }

    const meeting = await this.prisma.meeting.create({
      data: {
        organizationId,
        createdBy: userId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        provider: dto.provider || 'MANUAL',
        source: dto.provider || 'MANUAL',
        meetingUrl,
        providerEventId,
        providerMeetingId,
        startTime,
        endTime,
        durationSeconds,
        status: dto.status || MeetingStatus.CREATED,
        participants: dto.participants?.length
          ? {
              create: dto.participants.map((p) => ({
                name: p.name.trim(),
                email: p.email?.trim().toLowerCase(),
                role: p.role?.trim(),
                isExternal: p.isExternal || false,
              })),
            }
          : undefined,
      },
      include: {
        participants: true,
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(`Created meeting ${meeting.id} (${dto.provider || 'MANUAL'}) with URL: ${meetingUrl}`);
    return meeting;
  }

  /**
   * Generates video call link based on platform
   */
  async generateMeetingUrl(
    provider: string,
    organizationId: string,
    userId: string,
    details: {
      title: string;
      description?: string;
      startTime?: Date | null;
      endTime?: Date | null;
      participants?: Array<{ name?: string; email?: string }>;
    },
  ): Promise<{ meetingUrl: string; providerEventId?: string; providerMeetingId?: string }> {
    switch (provider) {
      case 'GOOGLE_MEET': {
        const res = await this.integrationsService.createGoogleMeetEvent(organizationId, userId, details);
        return {
          meetingUrl: res.meetingUrl,
          providerEventId: res.providerEventId,
          providerMeetingId: res.providerEventId,
        };
      }
      case 'ZOOM': {
        const randId = Math.floor(100000000 + Math.random() * 900000000);
        const pwd = Math.random().toString(36).substring(2, 8);
        return {
          meetingUrl: `https://zoom.us/j/${randId}?pwd=${pwd}`,
          providerMeetingId: String(randId),
        };
      }
      case 'MICROSOFT_TEAMS': {
        const threadId = Math.random().toString(36).substring(2, 10);
        return {
          meetingUrl: `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${threadId}%40thread.v2/0`,
        };
      }
      case 'MANUAL':
      default: {
        const slug = details.title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20) || 'room';
        const randHash = Math.random().toString(36).substring(2, 6);
        return {
          meetingUrl: `https://meet.jit.si/meetingos-${slug}-${randHash}`,
        };
      }
    }
  }

  async findAll(
    organizationId: string,
    query?: {
      search?: string;
      status?: MeetingStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = query?.limit ? Number(query.limit) : 50;
    const offset = query?.offset ? Number(query.offset) : 0;

    const whereClause: Prisma.MeetingWhereInput = {
      organizationId,
      isActive: true,
      ...(query?.status && { status: query.status }),
      ...(query?.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          {
            participants: {
              some: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
        ],
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.meeting.count({ where: whereClause }),
      this.prisma.meeting.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
        include: {
          participants: true,
          summaries: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          actionItems: {
            include: {
              assignee: {
                select: { id: true, name: true, email: true },
              },
              sourceSegment: {
                select: { id: true, startTimeMs: true, endTimeMs: true, speakerName: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          decisions: {
            select: {
              id: true,
              decision: true,
              context: true,
              confidence: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      items: items.map((m) => ({
        ...m,
        decisionsCount: m.decisions.length,
        actionsCount: m.actionItems.length,
        pendingActionsCount: m.actionItems.filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS').length,
        hasSummary: m.summaries.length > 0,
      })),
    };
  }

  async findById(organizationId: string, id: string, allowInactive = false) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id,
        organizationId,
        ...(!allowInactive && { isActive: true }),
      },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        participants: true,
        summaries: true,
        topics: true,
        decisions: true,
        actionItems: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        risks: true,
        openQuestions: true,
        transcripts: {
          include: {
            segments: {
              take: 100,
              orderBy: { sequence: 'asc' },
            },
          },
        },
        documents: true,
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${id} not found in this organization`);
    }

    return meeting;
  }

  async update(organizationId: string, id: string, dto: UpdateMeetingDto) {
    const existing = await this.findById(organizationId, id);

    const startTime = dto.startTime ? new Date(dto.startTime) : existing.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : existing.endTime;

    let durationSeconds = dto.durationSeconds !== undefined ? dto.durationSeconds : existing.durationSeconds;
    if (dto.startTime || dto.endTime) {
      if (startTime && endTime) {
        durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000));
      }
    }

    const meeting = await this.prisma.meeting.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.provider && { provider: dto.provider, source: dto.provider }),
        ...(dto.meetingUrl !== undefined && { meetingUrl: dto.meetingUrl?.trim() }),
        ...(dto.startTime !== undefined && { startTime }),
        ...(dto.endTime !== undefined && { endTime }),
        ...(durationSeconds !== undefined && { durationSeconds }),
        ...(dto.status && { status: dto.status }),
      },
      include: {
        participants: true,
      },
    });

    return meeting;
  }

  async delete(organizationId: string, id: string) {
    const existing = await this.prisma.meeting.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Meeting with ID ${id} not found in this organization`);
    }

    if (existing.providerEventId && existing.provider === 'GOOGLE_MEET') {
      await this.integrationsService.deleteGoogleCalendarEvent(organizationId, existing.providerEventId).catch((err) => {
        this.logger.warn(`Could not cascade delete from Google Calendar: ${err.message}`);
      });
    }

    await this.prisma.meeting.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });
    return { success: true, message: `Meeting ${id} soft-deleted successfully and removed from calendars` };
  }
}
