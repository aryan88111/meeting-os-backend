import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VideoRoomsService } from './video-rooms.service';
import {
  GenerateRoomTokenDto,
  IngestLiveCaptionDto,
  EndCallDto,
  GenerateGuestTokenDto,
  AddParticipantDto,
} from './dto/video-rooms.dto';

@ApiTags('Video Rooms (SFU)')
@Controller('video-rooms')
export class VideoRoomsController {
  constructor(private readonly videoRoomsService: VideoRoomsService) {}

  @Post(':meetingId/token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate WebRTC token for joining SFU video call room' })
  @ApiResponse({ status: 200, description: 'LiveKit access token and connection credentials' })
  async generateToken(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateRoomTokenDto,
  ) {
    return this.videoRoomsService.generateJoinToken(meetingId, user, dto);
  }

  @Post(':meetingId/guest-token')
  @ApiOperation({ summary: 'Generate guest WebRTC token for external attendee without login' })
  @ApiResponse({ status: 200, description: 'LiveKit guest token and connection credentials' })
  async generateGuestToken(
    @Param('meetingId') meetingId: string,
    @Body() dto: GenerateGuestTokenDto,
  ) {
    return this.videoRoomsService.generateGuestToken(meetingId, dto);
  }

  @Post(':meetingId/participants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a participant to the meeting' })
  @ApiResponse({ status: 201, description: 'Participant added successfully' })
  async addParticipant(
    @Param('meetingId') meetingId: string,
    @Body() dto: AddParticipantDto,
  ) {
    return this.videoRoomsService.addParticipant(meetingId, dto);
  }


  @Get(':meetingId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current video call room status and participants' })
  @ApiResponse({ status: 200, description: 'Room status and active session info' })
  async getStatus(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.videoRoomsService.getRoomStatus(meetingId, user);
  }

  @Post(':meetingId/caption')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingest live transcript caption segment' })
  @ApiResponse({ status: 200, description: 'Caption ingested and persisted' })
  async ingestCaption(
    @Param('meetingId') meetingId: string,
    @Body() dto: IngestLiveCaptionDto,
  ) {
    return this.videoRoomsService.ingestCaption(meetingId, dto);
  }

  @Post(':meetingId/end')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End video call room and trigger post-meeting AI intelligence' })
  @ApiResponse({ status: 200, description: 'Call terminated and intelligence extraction enqueued' })
  async endCall(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EndCallDto,
  ) {
    return this.videoRoomsService.endCall(meetingId, user, dto?.reason);
  }
}
