import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UploadTranscriptDto {
  @ApiProperty({ description: 'Raw transcript text or structured JSON string' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Original filename (e.g. roadmap.txt, meeting.vtt)' })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiPropertyOptional({ description: 'MIME type of uploaded file' })
  @IsString()
  @IsOptional()
  mimeType?: string;
}

export class UploadAndCreateMeetingDto extends UploadTranscriptDto {
  @ApiPropertyOptional({ description: 'Title of the new meeting', default: 'Uploaded Meeting Transcript' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Meeting description' })
  @IsString()
  @IsOptional()
  description?: string;
}
