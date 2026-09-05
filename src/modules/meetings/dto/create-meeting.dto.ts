import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MeetingSource, MeetingStatus } from '@prisma/client';

export class ParticipantDto {
  @ApiProperty({ example: 'Sarah Chen', description: 'Participant full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'sarah@example.com', required: false, description: 'Participant email address' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Lead Architect', required: false, description: 'Role or title' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ example: false, required: false, description: 'Whether participant is external to organization' })
  @IsBoolean()
  @IsOptional()
  isExternal?: boolean;
}

export class CreateMeetingDto {
  @ApiProperty({ example: 'Q3 Product Architecture & Sprint Kickoff', description: 'Meeting title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Discuss core platform architecture, pgvector indexes, and sprint backlog.', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: MeetingSource, default: MeetingSource.MANUAL, required: false })
  @IsEnum(MeetingSource)
  @IsOptional()
  provider?: MeetingSource;

  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij', required: false, description: 'Direct meeting join URL' })
  @IsString()
  @IsOptional()
  meetingUrl?: string;

  @ApiProperty({ example: '2026-09-06T14:30:00.000Z', required: false, description: 'Scheduled start timestamp' })
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiProperty({ example: '2026-09-06T15:30:00.000Z', required: false, description: 'Scheduled end timestamp' })
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiProperty({ example: 3600, required: false, description: 'Duration in seconds' })
  @IsInt()
  @IsOptional()
  durationSeconds?: number;

  @ApiProperty({ enum: MeetingStatus, default: MeetingStatus.CREATED, required: false })
  @IsEnum(MeetingStatus)
  @IsOptional()
  status?: MeetingStatus;

  @ApiProperty({ type: [ParticipantDto], required: false, description: 'List of meeting participants' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  @IsOptional()
  participants?: ParticipantDto[];
}
