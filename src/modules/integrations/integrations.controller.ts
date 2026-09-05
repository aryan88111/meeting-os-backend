import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { GoogleAuthCallbackDto } from './dto/google-auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('google/auth-url')
  @ApiOperation({ summary: 'Generate Google Calendar, Meet & Drive OAuth 2.0 authorization URL' })
  @ApiQuery({ name: 'redirectUri', required: false, type: String })
  getGoogleAuthUrl(@Query('redirectUri') redirectUri?: string) {
    return this.integrationsService.getGoogleAuthUrl(redirectUri);
  }

  @Post('google/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete Google OAuth 2.0 connection and save tokens' })
  async handleGoogleCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GoogleAuthCallbackDto,
  ) {
    return this.integrationsService.handleGoogleCallback(
      user.organizationId,
      user.userId,
      dto.code,
      dto.redirectUri,
    );
  }

  @Post('google/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synchronize Google Calendar events and Google Meet links into MeetingOS' })
  async syncGoogleCalendar(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.syncGoogleCalendar(user.organizationId, user.userId);
  }

  @Post('google/sync-transcript/:meetingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Automatically fetch and ingest transcript from Google Meet / Drive for a specific meeting',
  })
  @ApiResponse({
    status: 200,
    description: 'Transcript fetched and queued for AI extraction',
  })
  async syncGoogleMeetTranscript(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.integrationsService.fetchGoogleMeetTranscript(
      meetingId,
      user.organizationId,
    );
  }

  @Post('google/scan-transcripts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch scan recently ended Google Meet meetings and automatically ingest their transcripts',
  })
  async scanRecentTranscripts(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.scanAllEndedMeetingsTranscripts(
      user.organizationId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all connected workspace integrations' })
  async listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.listIntegrations(user.organizationId);
  }
}
