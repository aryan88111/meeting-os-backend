import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { KnowledgeService } from './knowledge.service';
import { AskKnowledgeBaseDto, RenameSessionDto } from './dto/ask-knowledge-base.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Search & Knowledge')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Get('meetings')
  @ApiOperation({ summary: 'Search meetings by keyword' })
  @ApiQuery({ name: 'q', required: true, type: String })
  async searchMeetings(@Query('q') query: string) {
    return this.searchService.searchMeetings(query);
  }

  @Post('ask')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ask questions across all workspace meetings (RAG Knowledge Base)' })
  async askKnowledgeBase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AskKnowledgeBaseDto,
  ) {
    if (dto.sessionId) {
      return this.knowledgeService.askInSession(
        user.organizationId,
        user.userId,
        dto.query,
        dto.sessionId,
      );
    }
    // Also create/persist the first session by default
    return this.knowledgeService.askInSession(
      user.organizationId,
      user.userId,
      dto.query,
    );
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all historical chat sessions for the current user' })
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeService.listSessions(user.organizationId, user.userId);
  }

  @Get('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get full message thread for a chat session' })
  async getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ) {
    return this.knowledgeService.getSession(user.organizationId, user.userId, sessionId);
  }

  @Patch('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Rename a chat session title' })
  async renameSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
    @Body() dto: RenameSessionDto,
  ) {
    return this.knowledgeService.renameSession(
      user.organizationId,
      user.userId,
      sessionId,
      dto.title,
    );
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a chat session and its message history' })
  async deleteSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ) {
    return this.knowledgeService.deleteSession(user.organizationId, user.userId, sessionId);
  }
}
