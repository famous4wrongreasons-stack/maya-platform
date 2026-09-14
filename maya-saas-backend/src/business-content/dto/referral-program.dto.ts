import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateReferralProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Inviter reward in kopecks.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  inviterRewardKopecks?: number;

  @ApiPropertyOptional({ description: 'Invitee reward in kopecks.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  inviteeRewardKopecks?: number;

  @ApiPropertyOptional({ description: 'Inviter percentage in basis points.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  inviterRewardPercentBasisPoints?: number;

  @ApiPropertyOptional({ description: 'Invitee percentage in basis points.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  inviteeRewardPercentBasisPoints?: number;

  @ApiPropertyOptional({ description: 'Inviter maximum liability in kopecks.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50_000)
  inviterRewardLiabilityCapKopecks?: number;

  @ApiPropertyOptional({ description: 'Invitee maximum liability in kopecks.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50_000)
  inviteeRewardLiabilityCapKopecks?: number;

  @ApiPropertyOptional({ default: 'RUB' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  terms?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Za-z0-9_-]+$/)
  codePrefix?: string;
}
