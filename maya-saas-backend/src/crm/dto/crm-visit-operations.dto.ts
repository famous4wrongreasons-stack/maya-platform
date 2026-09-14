import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Отметка о приходе клиента: 1 — пришёл, -1 — не пришёл, 0 — ожидание. */
export class SetCrmAttendanceDto {
  @ApiProperty({ enum: [1, 0, -1], example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 0, -1])
  attendance!: number;
}

/** Стянуть/растянуть визит. Время начала не двигается. */
export class SetCrmDurationDto {
  @ApiProperty({ example: 60, minimum: 5, maximum: 720 })
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(720)
  duration_minutes!: number;
}

/** Полная замена состава услуг визита. */
export class SetCrmServicesDto {
  @ApiProperty({ type: [String], example: ['18049154'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  service_ids!: string[];
}

/**
 * Ручная запись из журнала.
 *
 * Отличие от клиентской: время НЕ сверяется со свободными окнами — мастер
 * сажает клиента туда, куда решил, включая занятое окно и время вне графика.
 */
export class CreateCrmJournalAppointmentDto {
  @ApiProperty({ example: '1461615' })
  @IsString()
  staff_id!: string;

  @ApiProperty({ type: [String], example: ['18049154'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  service_ids!: string[];

  @ApiProperty({ example: '2026-08-04T12:00:00.000Z' })
  @IsDateString()
  start!: string;

  /** Пусто, когда записывает мастер: поле телефона видит только владелец. */
  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  client_phone?: string;

  @ApiPropertyOptional({ example: 'Станислав' })
  @IsOptional()
  @IsString()
  client_name?: string;

  @ApiPropertyOptional({ example: 60, minimum: 5, maximum: 720 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(720)
  duration_minutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Перенос визита из журнала: новое время и, при желании, другой мастер. */
export class RescheduleCrmJournalAppointmentDto {
  @ApiProperty({ example: '2026-08-04T15:30:00.000Z' })
  @IsDateString()
  start!: string;

  @ApiPropertyOptional({ example: '1461615' })
  @IsOptional()
  @IsString()
  staff_id?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  service_ids?: string[];
}

export class SearchCrmClientsDto {
  @ApiProperty({
    example: '9182',
    description:
      'Часть телефона или имени. Короткий запрос сознательно не ищется.',
  })
  @IsString()
  query!: string;
}
