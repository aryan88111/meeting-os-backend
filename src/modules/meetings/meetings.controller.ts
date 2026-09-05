import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';

@ApiTags('Meetings')
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get()
  @ApiOperation({ summary: 'List meetings for current organization' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listMeetings(
    @Query('limit') limit = '20',
    @Query('offset') offset = '0',
  ) {
    return this.meetingsService.findAll(Number(limit), Number(offset));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get meeting details by ID' })
  async getMeeting(@Param('id') id: string) {
    return this.meetingsService.findById(id);
  }
}
