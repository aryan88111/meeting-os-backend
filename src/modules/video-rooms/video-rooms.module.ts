import { Module, forwardRef } from '@nestjs/common';
import { VideoRoomsService } from './video-rooms.service';
import { VideoRoomsController } from './video-rooms.controller';
import { LivekitWebhookController } from './livekit-webhook.controller';
import { VideoRoomsGateway } from './video-rooms.gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    forwardRef(() => IntelligenceModule),
  ],
  controllers: [VideoRoomsController, LivekitWebhookController],
  providers: [VideoRoomsService, VideoRoomsGateway],
  exports: [VideoRoomsService, VideoRoomsGateway],
})
export class VideoRoomsModule {}
