import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { KnowledgeService } from './knowledge.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, KnowledgeService],
  exports: [SearchService, KnowledgeService],
})
export class SearchModule {}
