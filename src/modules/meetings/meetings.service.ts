import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(limit = 20, offset = 0) {
    return this.prisma.meeting.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        summaries: true,
        actionItems: true,
        decisions: true,
      },
    });
  }

  async findById(id: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: {
        summaries: true,
        topics: true,
        decisions: true,
        actionItems: true,
        risks: true,
        openQuestions: true,
        transcripts: true,
        documents: true,
      },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting with ID ${id} not found`);
    }

    return meeting;
  }
}
