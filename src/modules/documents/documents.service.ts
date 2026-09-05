import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMeetingId(meetingId: string) {
    return this.prisma.document.findMany({
      where: { meetingId },
    });
  }
}
