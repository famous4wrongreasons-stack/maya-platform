import {
  IsObject,
  IsOptional,
  ValidateIf,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';

/** SH-12: the sole resolve request is a bounded principal thread page. */
export interface WidgetThreadPageDto {
  before?: string;
  limit: number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@ValidatorConstraint({ name: 'WidgetThreadPage', async: false })
class WidgetThreadPageConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const page = value as Readonly<Record<string, unknown>>;
    if (Object.keys(page).some((key) => key !== 'before' && key !== 'limit'))
      return false;
    if (
      !Number.isInteger(page.limit) ||
      Number(page.limit) < 1 ||
      Number(page.limit) > 50
    )
      return false;
    return (
      page.before === undefined ||
      (typeof page.before === 'string' && UUID.test(page.before))
    );
  }
}

@ValidatorConstraint({ name: 'SelectorRenderEvidence', async: false })
class SelectorRenderEvidenceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const v = value as Record<string, unknown>;
    return (
      Object.keys(v).sort().join(',') === 'body_hash,envelope_seal,widget_id' &&
      typeof v.widget_id === 'string' &&
      UUID.test(v.widget_id) &&
      typeof v.body_hash === 'string' &&
      /^[0-9a-f]{64}$/.test(v.body_hash) &&
      typeof v.envelope_seal === 'string' &&
      /^[0-9a-f]{64}$/.test(v.envelope_seal)
    );
  }
}

@ValidatorConstraint({ name: 'BookingReceiptRead', async: false })
class BookingReceiptReadConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return false;
    const v = value as Record<string, unknown>;
    const request = args.object as ResolveWidgetDto;
    return (
      Object.keys(v).join(',') === 'widget_id' &&
      typeof v.widget_id === 'string' &&
      UUID.test(v.widget_id) &&
      request.rendered === undefined &&
      request.thread_page?.limit === 20 &&
      request.thread_page?.before === undefined
    );
  }
}

export class ResolveWidgetDto {
  @IsObject()
  @Validate(WidgetThreadPageConstraint)
  thread_page!: WidgetThreadPageDto;

  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @Validate(BookingReceiptReadConstraint)
  booking_receipt?: { widget_id: string };

  @IsOptional()
  @IsObject()
  @Validate(SelectorRenderEvidenceConstraint)
  rendered?: import('../rendering/selector-lifecycle.service').SelectorRenderEvidence;
}
