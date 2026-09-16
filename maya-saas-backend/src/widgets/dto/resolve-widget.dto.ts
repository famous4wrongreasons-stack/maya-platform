import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

/** Resolve takes a widget id and nothing else: reading a widget may not carry instructions. */
export class ResolveWidgetDto {
  @ApiProperty({
    description: 'The widget whose current envelope is being read.',
  })
  @IsString()
  @IsUUID()
  widget_id!: string;
}
