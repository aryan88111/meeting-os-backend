import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { TranscriptsModule } from './modules/transcripts/transcripts.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SearchModule } from './modules/search/search.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    QueueModule,
    HealthModule,
    MeetingsModule,
    TranscriptsModule,
    IntelligenceModule,
    DocumentsModule,
    SearchModule,
  ],
})
export class AppModule {}
