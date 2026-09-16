import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What a client may send to `POST /api/widgets/intent`.
 *
 * READ THE ABSENCES, NOT THE FIELDS. There is no `url`, no `endpoint`, no `capability`, no `table`,
 * no `provider`, no `tenant_id` and no `role` here — and that is the whole of the
 * BUTTON -> ENDPOINT guarantee. A check that rejected such a field could be bypassed; a field that
 * does not exist cannot be populated. With `forbidNonWhitelisted` on the global validation pipe, a
 * body carrying one is refused rather than quietly ignored.
 */
export class SubmitIntentDto {
  @ApiProperty({
    description:
      'Opaque token from the rendered model. The client never authors it.',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  intent_token!: string;

  @ApiPropertyOptional({
    description:
      'Values from a server-declared closed domain, or inside server-declared bounds re-read at Gate 8.',
  })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    description: 'Present only when the record requires a spoken readback.',
  })
  @IsOptional()
  @IsObject()
  readback_ack?: {
    readback_ref: string;
    body_hash: string;
    affirmation: string;
  } | null;
}
