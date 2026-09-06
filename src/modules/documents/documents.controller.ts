import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
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

  @Get('export')
  @ApiOperation({ summary: 'Export and download meeting intelligence report (Binary Word .docx, Binary PDF, or Markdown)' })
  @ApiQuery({ name: 'format', required: false, enum: ['docx', 'pdf', 'markdown'], description: 'Format of the report (docx, pdf, markdown)' })
  async exportDocument(
    @Param('id') meetingId: string,
    @Query('format') format: string = 'docx',
    @Res() res: Response,
  ) {
    const report = await this.documentsService.exportMeetingReport(meetingId, format);

    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    return res.send(report.content);
  }
}
