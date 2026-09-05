import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TranscriptsService {
  constructor(private readonly prisma: PrismaService) {}

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
      throw new NotFoundException(`Transcript for meeting ${meetingId} not found`);
    }

    return transcript;
  }

  async findSegments(meetingId: string) {
    const transcript = await this.prisma.transcript.findFirst({
      where: { meetingId },
    });

    if (!transcript) {
      return [];
    }

    return this.prisma.transcriptSegment.findMany({
      where: { transcriptId: transcript.id },
      orderBy: { sequence: 'asc' },
    });
  }
}
