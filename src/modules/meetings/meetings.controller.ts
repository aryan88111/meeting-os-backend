import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MeetingStatus } from '@prisma/client';

@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  @ApiOperation({ summary: 'Schedule or create a new meeting session' })
  @ApiResponse({ status: 201, description: 'Meeting session created successfully' })
  async createMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetingsService.create(user.organizationId, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List meetings for current organization' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Filter by title, attendee, or description' })
  @ApiQuery({ name: 'status', required: false, enum: MeetingStatus, description: 'Filter by meeting status' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listMeetings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: MeetingStatus,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.meetingsService.findAll(user.organizationId, {
      search,
      status,
      limit: Number(limit),
      offset: Number(offset),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full meeting details, transcripts, intelligence, and action items' })
  async getMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.meetingsService.findById(user.organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update meeting details, URL, status, or timestamps' })
  async updateMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a meeting record and cascade related data' })
  async deleteMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.meetingsService.delete(user.organizationId, id);
  }
}
