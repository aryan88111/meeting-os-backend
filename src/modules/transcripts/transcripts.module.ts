import { Module, forwardRef } from '@nestjs/common';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [forwardRef(() => IntelligenceModule)],
  controllers: [TranscriptsController],
  providers: [TranscriptsService],
  exports: [TranscriptsService],
})
export class TranscriptsModule {}
