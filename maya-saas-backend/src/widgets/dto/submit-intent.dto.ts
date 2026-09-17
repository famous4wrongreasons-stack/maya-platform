// §3.8 — the submission, as a DTO. P-F88 (GATES-PLAN-V11).
//
// READ THE ABSENCES, NOT THE FIELDS. There is no `url`, no `endpoint`, no `capability`, no `table`,
// no `provider`, no `tenant_id` and no `role` here — and that is the whole of the BUTTON -> ENDPOINT
// guarantee (R3.8.1). A check that rejected such a field could be bypassed; a field that does not
// exist cannot be populated. With `forbidNonWhitelisted` on the global validation pipe, a body
// carrying one is refused rather than quietly ignored.
//
// The absence is the first half. The second half is F88's total walk (`../validation/f88-walk.ts`),
// run here over the WHOLE submission, because `forbidNonWhitelisted` only sees the root: a forbidden
// key three levels inside `inputs` is invisible to it, and that is exactly what R3.8.2 refuses
// ("every key on it is refused at any depth of a submission"). The walk runs inside the global
// `ValidationPipe`, before the handler and therefore before `intentSubmitArgs` — the `EP-INGRESS`
// evaluation point. `F88SubmissionPipe` binds the same single function at controller scope (IR-F88-1).
//
// Every refusal here is a 400 protocol rejection, never a §3.9 refusal: R3.9.3 governs the gate table,
// and no gate has run yet.
//
// §3.8's declared shape (C11:4612-4633), member by member:
//   contract           REQUIRED literal            — a body without it is not a submission (F88-3)
//   widget_id          REQUIRED, validated as UUID — SH-17 is an OPEN CONFORMANCE FLAG (C11:7403):
//                                                    certified text says ULID, built K3 code uses
//                                                    UUID, and GATES-PLAN-V11 §0.2 rules that P-F88
//                                                    validates UUID. Gate 1 compares it (P-G15a).
//   intent_token       REQUIRED, non-null          — opaque, server-minted; the client never authors it
//   inputs             REQUIRED, NULLABLE          — `Record<string, string|number|boolean|string[]>`
//                                                    or null. Omitting it is not the same as null.
//   client_nonce       REQUIRED                    — the client's own retry key. D-11: Gate 9 appends
//                                                    on every submission, and dedupe on this value is
//                                                    optional and is not a clause (AMB-28).
//   profile_id         REQUIRED, ADVISORY (R3.8.3) — it shapes the response and detects a renderer
//                                                    that delivered what it should not have. NO GATE
//                                                    KEYS ITS ANTECEDENT ON IT; F88-7 in
//                                                    `f88-walk.spec.ts` asserts that over the sources.
//   spoken_transcript  REFUSED at the shape stage  — voice only in §3.8; this route's carrier is
//                                                    `pwa` (`intent-submit-args.ts`), and V5/§4.4 keep
//                                                    a data subject's affirmation out of the log
//                                                    (AMB-26c, R-7). Declared so the 400 names it.
//   client_emitted_at  OPTIONAL, ADVISORY          — never business time
//   readback_ack       REQUIRED iff Gate 8-R applies, refused otherwise; NON-NULL when present. A null
//                      ack is a 400 at the shape stage, never `readback_mismatch` (AMB-02c).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import {
  describeF88Violation,
  f88Violations,
  SubmissionShapeRejection,
  type ShapeStageIssue,
} from '../validation/f88-walk';

/** §3.8's contract literal. A body that does not name it is not a `WidgetIntentSubmission`. */
export const WIDGET_INTENT_SUBMISSION_CONTRACT =
  'maya.widget.intent.submission/1';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The §3.8 rules that need the WHOLE body rather than one member: F88's walk, and the two members
 * whose refusal is about PRESENCE — which a per-property decorator cannot see, because class-validator
 * skips an optional member that is absent or null.
 *
 * Presence is tested as `!== undefined`, never as `in`: the DTO's optional members are declared class
 * fields, so `plainToInstance` gives every instance an own property for each of them, and `in` would
 * answer true for a member nobody sent.
 */
export const submissionShapeIssues = (body: unknown): ShapeStageIssue[] => {
  if (!isPlainObject(body))
    return [{ field: '', message: '§3.8: the submission is not an object' }];
  const issues: ShapeStageIssue[] = f88Violations(
    'WidgetIntentSubmission',
    body,
  ).map((v) => ({ field: v.path, message: describeF88Violation(v) }));
  if (body.spoken_transcript !== undefined)
    issues.push({
      field: 'spoken_transcript',
      message:
        '§3.8: `spoken_transcript` is voice-only and is refused at the shape stage on this carrier; a data subject’s affirmation is never logged (AMB-26c, R-7)',
    });
  if (body.readback_ack === null)
    issues.push({
      field: 'readback_ack',
      message:
        '§3.8: `readback_ack` is REQUIRED iff Gate 8-R applies and refused otherwise; a null ack is neither, and is a 400 at the shape stage rather than `readback_mismatch` (AMB-02c)',
    });
  return issues;
};

/**
 * It THROWS rather than returning false, and that is deliberate. A class-validator constraint reports
 * under the property it is attached to, so a merged message would arrive labelled `contract` however
 * deep the real violation sits — and under F88.2 the location IS the finding. Throwing the same
 * `SubmissionShapeRejection` the controller-scope pipe throws (IR-F88-1) makes the route's answer
 * identical whether the walk ran in the global pipe or in that pipe: one detail per issue, each naming
 * its own path.
 */
@ValidatorConstraint({ name: 'widgetSubmissionShape', async: false })
export class SubmissionShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const issues = submissionShapeIssues(args.object);
    if (issues.length > 0) throw new SubmissionShapeRejection(issues);
    return true;
  }

  defaultMessage(): string {
    return '§3.8: the submission does not conform';
  }
}

/**
 * R3.8.1's closed value domain, as a shape rule: a flat map of scalars. Bounds, enums and normalizers
 * are Gate 8's duty (R3.6.4/R3.6.5) and are not re-stated here; what is enforced here is that no value
 * is a structure, so a body cannot smuggle an object graph through a "closed domain" member.
 *
 * Declared WITHOUT `@IsOptional()`, so an absent `inputs` fails: §3.8 makes it required and nullable,
 * and "omitted" and "null" are different answers.
 */
@ValidatorConstraint({ name: 'widgetClosedInputs', async: false })
export class ClosedInputsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null) return true;
    if (!isPlainObject(value)) return false;
    return Object.values(value).every(
      (v) =>
        typeof v === 'string' ||
        (typeof v === 'number' && Number.isFinite(v)) ||
        typeof v === 'boolean' ||
        (Array.isArray(v) && v.every((e) => typeof e === 'string')),
    );
  }

  defaultMessage(): string {
    return '§3.8: `inputs` is required and nullable, and every value is a string, a number, a boolean or a string array (R3.8.1)';
  }
}

/** §3.8's `ReadbackAck`: exactly three string members, all non-empty. Gate 8-R reads the record. */
@ValidatorConstraint({ name: 'widgetReadbackAck', async: false })
export class ReadbackAckConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value).sort();
    if (keys.join(',') !== 'affirmation,body_hash,readback_ref') return false;
    return Object.values(value).every(
      (v) => typeof v === 'string' && v.length > 0,
    );
  }

  defaultMessage(): string {
    return '§3.8: `readback_ack` carries exactly `readback_ref`, `body_hash` and `affirmation`, each a non-empty string';
  }
}

export interface SubmittedReadbackAck {
  readback_ref: string;
  body_hash: string;
  affirmation: string;
}

export class SubmitIntentDto {
  @ApiProperty({
    description: '§3.8 contract literal.',
    enum: [WIDGET_INTENT_SUBMISSION_CONTRACT],
  })
  @IsIn([WIDGET_INTENT_SUBMISSION_CONTRACT])
  // The whole-body rules hang off the one member every conformant submission carries, so they run
  // whether or not that member is itself well formed.
  @Validate(SubmissionShapeConstraint)
  contract!: typeof WIDGET_INTENT_SUBMISSION_CONTRACT;

  @ApiProperty({
    description:
      'The envelope this tap belongs to. Gate 1 refuses a token whose record names another widget (P-G15a).',
  })
  @IsUUID()
  widget_id!: string;

  @ApiProperty({
    description:
      'Opaque token from the rendered model. The client never authors it.',
  })
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  intent_token!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Values from a server-declared closed domain, or inside server-declared bounds re-read at Gate 8. Required; null when the widget takes none.',
  })
  @Validate(ClosedInputsConstraint)
  inputs!: Record<string, string | number | boolean | string[]> | null;

  @ApiProperty({ description: "The client's retry key for this submission." })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  client_nonce!: string;

  @ApiProperty({
    description:
      'ADVISORY (R3.8.3): it shapes the response and detects a renderer that delivered what it should not have. No gate keys its antecedent on it.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  profile_id!: string;

  @ApiPropertyOptional({
    description:
      'Refused at the shape stage on this carrier (AMB-26c). Declared so the refusal names it.',
  })
  @IsOptional()
  @IsString()
  spoken_transcript?: string;

  @ApiPropertyOptional({ description: 'Advisory; never business time.' })
  @IsOptional()
  @IsISO8601()
  client_emitted_at?: string;

  @ApiPropertyOptional({
    description: 'Present only when the record requires a spoken readback.',
  })
  @IsOptional()
  @Validate(ReadbackAckConstraint)
  readback_ack?: SubmittedReadbackAck;
}
