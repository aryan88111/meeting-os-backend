import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AskKnowledgeBaseDto {
  @ApiProperty({
    description: 'Natural language question to ask across workspace meeting intelligence',
    example: 'What did we decide in our last meeting?',
  })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: 'Optional existing chat session ID to continue conversation',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class RenameSessionDto {
  @ApiProperty({
    description: 'New session title',
    example: 'Sprint Architecture Q&A',
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}
