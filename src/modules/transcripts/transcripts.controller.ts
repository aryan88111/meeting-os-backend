import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TranscriptsService } from './transcripts.service';
import {
  UploadTranscriptDto,
  UploadAndCreateMeetingDto,
} from './dto/upload-transcript.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Transcripts')
@Controller()
export class TranscriptsController {
  constructor(private readonly transcriptsService: TranscriptsService) {}

  @Get('meetings/:id/transcript')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get meeting transcript metadata and content' })
  async getTranscript(@Param('id') meetingId: string) {
    return this.transcriptsService.findByMeetingId(meetingId);
  }

  @Get('meetings/:id/transcript/segments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get ordered transcript segments with speaker attribution',
  })
  async getSegments(@Param('id') meetingId: string) {
    return this.transcriptsService.findSegments(meetingId);
  }

  @Post('meetings/:id/transcript/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload and parse transcript file/text for an existing meeting',
  })
  @ApiResponse({
    status: 200,
    description: 'Transcript parsed and queued for AI intelligence processing',
  })
  async uploadTranscript(
    @Param('id') meetingId: string,
    @Body() dto: UploadTranscriptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transcriptsService.uploadForMeeting(meetingId, dto, user);
  }

  @Post('transcripts/upload-and-create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Upload a transcript and automatically provision a new meeting in one step',
  })
  @ApiResponse({
    status: 201,
    description: 'Meeting created and transcript queued for processing',
  })
  async uploadAndCreate(
    @Body() dto: UploadAndCreateMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transcriptsService.uploadAndCreateMeeting(dto, user);
  }
}
