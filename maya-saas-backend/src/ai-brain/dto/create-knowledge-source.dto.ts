import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { UserRole } from '../../common/domain.enums';

export class CreateKnowledgeSourceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(50_000)
  content!: string;

  @IsOptional()
  @IsIn(['policy', 'handbook', 'playbook', 'faq', 'procedure'])
  sourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @IsEnum(UserRole, { each: true })
  audienceRoles!: UserRole[];
}
