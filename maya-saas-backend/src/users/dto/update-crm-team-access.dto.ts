import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { UserRole } from '../../common/domain.enums';

export class UpdateCrmTeamAccessDto {
  @ApiPropertyOptional({
    enum: [UserRole.ADMINISTRATOR, UserRole.STAFF],
  })
  @IsOptional()
  @IsIn([UserRole.ADMINISTRATOR, UserRole.STAFF])
  role?: UserRole.ADMINISTRATOR | UserRole.STAFF;

  @ApiPropertyOptional({ example: 'administrator@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  @MaxLength(32)
  phone?: string;
}
