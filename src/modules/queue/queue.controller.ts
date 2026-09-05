import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { QueueService, QueueStats } from './queue.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RABBITMQ_ROUTING_KEYS } from './queue.constants';

@ApiTags('Queue & DLQ Management')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get RabbitMQ Queue Health, message depths, and DLQ metrics',
  })
  @ApiResponse({ status: 200, description: 'Queue metrics and connection status' })
  async getStats(): Promise<QueueStats> {
    return this.queueService.getQueueStats();
  }

  @Post('dlq/replay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Replay dead-lettered messages from DLQ back into primary work queues',
  })
  @ApiResponse({ status: 200, description: 'Count of successfully replayed messages' })
  async replayDLQ(
    @Query('limit') limit?: string,
  ): Promise<{ replayedCount: number }> {
    const replayLimit = limit ? parseInt(limit, 10) : 10;
    return this.queueService.replayDLQ(replayLimit);
  }

  @Delete('dlq/purge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Purge all poisoned / failed messages from the Dead-Letter Queue',
  })
  @ApiResponse({ status: 200, description: 'Count of purged DLQ messages' })
  async purgeDLQ(): Promise<{ purgedCount: number }> {
    return this.queueService.purgeDLQ();
  }

  @Post('test-publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Test publish a job to the primary exchange',
  })
  async testPublish(
    @Body()
    body: {
      routingKey?: string;
      payload: Record<string, any>;
    },
  ) {
    const routingKey = body.routingKey || RABBITMQ_ROUTING_KEYS.INTELLIGENCE;
    const success = await this.queueService.publishJob(routingKey, body.payload, {
      messageId: `test-${Date.now()}`,
    });
    return { success, routingKey, payload: body.payload };
  }
}
