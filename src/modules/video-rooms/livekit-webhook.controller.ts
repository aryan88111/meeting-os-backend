import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VideoRoomsService } from './video-rooms.service';

@ApiTags('Video Rooms (SFU)')
@Controller('video-rooms')
export class LivekitWebhookController {
  constructor(private readonly videoRoomsService: VideoRoomsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false, transform: false }))
  @ApiOperation({ summary: 'Handle LiveKit SFU server webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Body() body: any,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.videoRoomsService.handleLiveKitWebhook(body, authHeader);
  }
}
