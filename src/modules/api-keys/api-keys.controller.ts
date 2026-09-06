import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('API Keys & Developer')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspace API keys' })
  async listKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeysService.listApiKeys(user.organizationId, user.userId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get live workspace API consumption, quota metrics, and tier details' })
  async getUsageStats(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeysService.getWorkspaceUsageStats(user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Generate a new scoped developer API key' })
  async createKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.createApiKey(user.organizationId, user.userId, dto);
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke / deactivate an API key' })
  async revokeKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.revokeApiKey(user.organizationId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently delete an API key' })
  async deleteKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeysService.deleteApiKey(user.organizationId, id);
  }
}
