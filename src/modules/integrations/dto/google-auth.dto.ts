import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleAuthCallbackDto {
  @ApiProperty({ description: 'OAuth 2.0 authorization code from Google consent redirect' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Redirect URI used in the initial OAuth request', required: false })
  @IsString()
  @IsOptional()
  redirectUri?: string;
}
