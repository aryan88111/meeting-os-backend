import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('meetings/:id/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List generated PDF/DOCX documents for a meeting' })
  async getDocuments(@Param('id') meetingId: string) {
    return this.documentsService.findByMeetingId(meetingId);
  }
}
