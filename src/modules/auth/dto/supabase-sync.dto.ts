import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SupabaseSyncDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsIn...', description: 'Supabase OAuth access token' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiProperty({ example: 'john@gmail.com', required: false, description: 'User email from OAuth profile' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'John Doe', required: false, description: 'User full name from OAuth profile' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'https://lh3.googleusercontent.com/...', required: false, description: 'Avatar URL' })
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiProperty({ required: false, description: 'Provider OAuth access token (e.g. Google Access Token)' })
  @IsString()
  @IsOptional()
  providerToken?: string;

  @ApiProperty({ required: false, description: 'Provider OAuth refresh token (e.g. Google Refresh Token)' })
  @IsString()
  @IsOptional()
  providerRefreshToken?: string;

  @ApiProperty({ example: 'google', required: false, description: 'OAuth provider name' })
  @IsString()
  @IsOptional()
  provider?: string;
}
