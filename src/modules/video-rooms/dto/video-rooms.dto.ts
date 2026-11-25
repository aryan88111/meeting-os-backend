import { IsString, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateRoomTokenDto {
  @ApiPropertyOptional({ description: 'Custom participant display name', example: 'Sarah Connor' })
  @IsOptional()
  @IsString()
  participantName?: string;

  @ApiPropertyOptional({ description: 'Whether the participant can publish camera and microphone', default: true })
  @IsOptional()
  @IsBoolean()
  canPublish?: boolean;

  @ApiPropertyOptional({ description: 'Whether the participant can share their screen', default: true })
  @IsOptional()
  @IsBoolean()
  canPublishData?: boolean;
}

export class IngestLiveCaptionDto {
  @ApiProperty({ description: 'Speaker participant identity or user ID', example: 'usr_98a72b' })
  @IsString()
  speakerId: string;

  @ApiProperty({ description: 'Speaker display name', example: 'Sarah Connor' })
  @IsString()
  speakerName: string;

  @ApiProperty({ description: 'Transcribed text segment', example: 'Let us review the Q3 roadmap deliverables.' })
  @IsString()
  text: string;

  @ApiPropertyOptional({ description: 'Start time offset in milliseconds from call start', example: 12400 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  startTimeMs?: number;

  @ApiPropertyOptional({ description: 'End time offset in milliseconds from call start', example: 15600 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  endTimeMs?: number;

  @ApiPropertyOptional({ description: 'Whether this is an interim (real-time stream) or final segment', default: false })
  @IsOptional()
  @IsBoolean()
  isInterim?: boolean;

  @ApiPropertyOptional({ description: 'Confidence score between 0.0 and 1.0', example: 0.98 })
  @IsOptional()
  @IsNumber()
  confidence?: number;
}

export class EndCallDto {
  @ApiPropertyOptional({ description: 'Reason for terminating the call session', example: 'Meeting adjourned by host' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GenerateGuestTokenDto {
  @ApiProperty({ description: 'Guest display name', example: 'Alex Smith' })
  @IsString()
  guestName: string;

  @ApiPropertyOptional({ description: 'Guest email address', example: 'alex@example.com' })
  @IsOptional()
  @IsString()
  guestEmail?: string;
}

export class AddParticipantDto {
  @ApiProperty({ description: 'Participant full name', example: 'Alex Smith' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Participant email address', example: 'alex@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Participant meeting role', example: 'ATTENDEE' })
  @IsOptional()
  @IsString()
  role?: string;
}

