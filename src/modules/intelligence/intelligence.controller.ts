import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';

@ApiTags('Intelligence')
@Controller('meetings/:id/intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Post('process')
  @ApiOperation({ summary: 'Process or re-generate intelligence from meeting transcripts' })
  async processIntelligence(@Param('id') meetingId: string) {
    return this.intelligenceService.processMeetingIntelligence(meetingId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get meeting summary' })
  async getSummary(@Param('id') meetingId: string) {
    return this.intelligenceService.getSummary(meetingId);
  }

  @Get('topics')
  @ApiOperation({ summary: 'Get extracted topics' })
  async getTopics(@Param('id') meetingId: string) {
    return this.intelligenceService.getTopics(meetingId);
  }

  @Get('decisions')
  @ApiOperation({ summary: 'Get extracted decisions' })
  async getDecisions(@Param('id') meetingId: string) {
    return this.intelligenceService.getDecisions(meetingId);
  }

  @Get('action-items')
  @ApiOperation({ summary: 'Get extracted action items' })
  async getActionItems(@Param('id') meetingId: string) {
    return this.intelligenceService.getActionItems(meetingId);
  }

  @Get('risks')
  @ApiOperation({ summary: 'Get extracted risks and blockers' })
  async getRisks(@Param('id') meetingId: string) {
    return this.intelligenceService.getRisks(meetingId);
  }

  @Get('questions')
  @ApiOperation({ summary: 'Get open questions' })
  async getOpenQuestions(@Param('id') meetingId: string) {
    return this.intelligenceService.getOpenQuestions(meetingId);
  }
}

