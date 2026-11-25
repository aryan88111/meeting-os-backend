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

  @Post('google/push-meeting/:meetingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Push an existing meeting to Google Calendar and attach a genuine Google Meet video link',
  })
  async pushMeetingToGoogleCalendar(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.integrationsService.pushMeetingToGoogleCalendar(
      meetingId,
      user.organizationId,
      user.userId,
    );
  }

  // ==========================================
  // MICROSOFT TEAMS CONTROLLER ENDPOINTS
  // ==========================================

  @Get('microsoft/auth-url')
  @ApiOperation({ summary: 'Generate Microsoft Entra / Graph OAuth 2.0 authorization URL' })
  @ApiQuery({ name: 'redirectUri', required: false, type: String })
  getMicrosoftAuthUrl(@Query('redirectUri') redirectUri?: string) {
    return this.integrationsService.getMicrosoftAuthUrl(redirectUri);
  }

  @Post('microsoft/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete Microsoft OAuth 2.0 connection and save tokens' })
  async handleMicrosoftCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GoogleAuthCallbackDto,
  ) {
    return this.integrationsService.handleMicrosoftCallback(
      user.organizationId,
      user.userId,
      dto.code,
      dto.redirectUri,
    );
  }

  @Post('microsoft/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synchronize Microsoft Calendar events and Teams meetings into MeetingOS' })
  async syncMicrosoftCalendar(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.syncMicrosoftCalendar(user.organizationId);
  }

  @Post('microsoft/sync-transcript/:meetingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fetch and ingest transcript from Microsoft Teams / Graph API for a specific meeting',
  })
  async syncMicrosoftTeamsTranscript(
    @Param('meetingId') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.integrationsService.syncMicrosoftTeamsTranscript(
      user.organizationId,
      meetingId,
    );
  }

  @Post('microsoft/scan-transcripts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Batch scan recently ended Microsoft Teams meetings and ingest their transcripts',
  })
  async scanRecentMicrosoftTranscripts(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.scanRecentMicrosoftTranscripts(
      user.organizationId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all connected workspace integrations' })
  async listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.listIntegrations(user.organizationId);
  }
}
