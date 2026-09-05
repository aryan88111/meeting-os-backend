import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('meetings')
  @ApiOperation({ summary: 'Search meetings by keyword' })
  @ApiQuery({ name: 'q', required: true, type: String })
  async searchMeetings(@Query('q') query: string) {
    return this.searchService.searchMeetings(query);
  }
}
