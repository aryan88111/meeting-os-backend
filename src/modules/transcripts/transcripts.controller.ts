import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TranscriptsService } from './transcripts.service';

@ApiTags('Transcripts')
@Controller('meetings/:id/transcript')
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Get()
  @ApiOperation({ summary: 'Get meeting transcript metadata and content' })
  async getTranscript(@Param('id') meetingId: string) {
    return this.transcriptsService.findByMeetingId(meetingId);
  }

  @Get('segments')
  @ApiOperation({ summary: 'Get ordered transcript segments with speaker attribution' })
  async getSegments(@Param('id') meetingId: string) {
    return this.transcriptsService.findSegments(meetingId);
  }
}
