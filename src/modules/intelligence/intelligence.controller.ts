import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntelligenceService } from './intelligence.service';

@ApiTags('Intelligence')
@Controller('meetings/:id/intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get meeting summary' })
  async getSummary(@Param('id') meetingId: string) {
    return this.intelligenceService.getSummary(meetingId);
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
}
