import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Конверт теневой доставки от источника.
 *
 * 🔴 Здесь НЕТ ни `tenant_slug`, ни тела провайдера. Арендатор определяется
 * парой (провайдер, компания) через интеграцию, а истина о записи
 * перечитывается у источника: подделать конверт можно, состояние — нет.
 */
export class ShadowDeliveryDto {
  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(64)
  external_company_id!: string;

  /** Тип доставки в словаре провайдера. Каноническое имя даёт Maya. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  event?: string;

  /** Различитель ресурса из новых форматов провайдера. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  resource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  /** Идентификатор сущности у провайдера. Провенанс, не идентичность Maya. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  external_id?: string;

  /**
   * ИМЕНА ключей верхнего уровня тела — без значений.
   *
   * Ровно столько, чтобы понять состав неизвестного трафика, и ни байтом
   * больше: значения могут содержать имя и телефон клиента.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  payload_keys?: string[];
}
