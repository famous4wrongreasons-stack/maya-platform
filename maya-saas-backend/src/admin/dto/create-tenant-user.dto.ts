import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

import { UserRole } from '../../common/domain.enums';

const MANAGEABLE_TENANT_ROLES = [
  UserRole.TENANT_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.STAFF,
] as const;

export class CreateTenantUserDto {
  @ApiProperty({ example: 'admin@salon.ru' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'Старший администратор' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  phone?: string;

  @ApiPropertyOptional({ example: 'cm123branch0001' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({
    example: 'StrongPass123',
    description:
      'Optional. If omitted, backend generates a temporary password and returns it once.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    enum: MANAGEABLE_TENANT_ROLES,
    default: UserRole.TENANT_ADMIN,
  })
  @IsOptional()
  @IsIn(MANAGEABLE_TENANT_ROLES)
  role?: (typeof MANAGEABLE_TENANT_ROLES)[number];
}
