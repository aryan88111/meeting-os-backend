import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(meetingId: string) {
    return this.prisma.meetingSummary.findFirst({
      where: { meetingId },
    });
  }

  async getDecisions(meetingId: string) {
    return this.prisma.decision.findMany({
      where: { meetingId },
      include: { sourceSegment: true },
    });
  }

  async getActionItems(meetingId: string) {
    return this.prisma.actionItem.findMany({
      where: { meetingId },
      include: { sourceSegment: true },
    });
  }

  async getRisks(meetingId: string) {
    return this.prisma.risk.findMany({
      where: { meetingId },
      include: { sourceSegment: true },
    });
  }
}
