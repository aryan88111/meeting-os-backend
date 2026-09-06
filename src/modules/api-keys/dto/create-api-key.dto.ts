import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Name or label for the API Key', example: 'Production Webhook Service' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ 
    description: 'Array of permitted scopes', 
    example: ['meetings:read', 'meetings:write', 'rag:query'],
    type: [String]
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ 
    description: 'Optional expiration in days (e.g., 30, 90, 365)', 
    example: 90 
  })
  @IsOptional()
  expiresInDays?: number;
}
