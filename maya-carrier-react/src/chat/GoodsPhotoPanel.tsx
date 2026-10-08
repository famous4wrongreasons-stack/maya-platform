import type { GoodsPhotoFailureReason, GoodsPhotoPort, GoodsPhotoReviewFields, GoodsPhotoView } from '../../../maya-chat-shell/src/shell/goods-photo.ts';
import type { Tokens } from '../identity/tokens.ts';
import { GoodsPhotoPicker } from './GoodsPhotoPicker.tsx';

const failureText = (failure: GoodsPhotoFailureReason | null): string => {
  switch (failure) {
    case 'recognition_unavailable': return 'Распознавание фото пока не подключено. Строки не извлечены.';
    case 'invalid_photo': return 'Нужен один файл PNG, JPEG или WebP до 2 МиБ.';
    case 'invalid_request': return 'Проверьте поля: количество, единицу, закупочную цену, валюту, склад и дату прихода.';
    case 'source_unavailable': return 'Актуальные данные YCLIENTS недоступны. Сопоставление не завершено.';
    case 'conflict': return 'Данные или версия предложения изменились. Текущее предложение нельзя повторно отправить с другими полями.';
    case 'forbidden': return 'Подготовка прихода сейчас недоступна.';
    case 'signed_out': return 'Сессия завершена.';
    case 'unknown': return 'Ответ на подготовку предложения не получен. Проверьте текущий разговор; повторная отправка отключена.';
    case 'unavailable': return 'Подготовка сейчас недоступна. Изменения на склад не подтверждены.';
    case null: return '';
  }
};

function Field({ label, value, change, disabled, placeholder, t }: {
  readonly label: string; readonly value: string; readonly change: (value: string) => void;
  readonly disabled: boolean; readonly placeholder?: string; readonly t: Tokens;
}) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '10px 0', fontSize: 14 }}>
    {label}
    <input type="text" value={value} disabled={disabled} placeholder={placeholder} autoComplete="off"
      onChange={(event) => change(event.currentTarget.value)}
      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid', borderRadius: 10, background: 'transparent', color: t.ink, font: 'inherit' }} />
  </label>;
}

/** Local attachment/review controls. Business approval remains the canonical chat widget. */
export function GoodsPhotoPanel({ view, port, disabled, t }: {
  readonly view: GoodsPhotoView;
  readonly port: GoodsPhotoPort;
  readonly disabled: boolean;
  readonly t: Tokens;
}) {
  if (view.phase === 'closed') return <button type="button" disabled={disabled} onClick={() => port.open()}
    style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', fontSize: 14, textDecoration: 'underline', cursor: 'pointer' }}>Товар по фото накладной</button>;
  const locked = disabled || view.busy !== null || view.phase === 'uncertain' || view.reviewStatus === 'held' || view.reviewStatus === 'completed';
  const edit = (fields: Partial<GoodsPhotoReviewFields>) => port.editReview(fields);
  const selected = view.lines.find(line => line.sourceLine === view.selectedLine);
  const item = view.item;
  const units = item === null ? [] : [
    ...(item.saleUnitId === null || item.saleUnitLabel === null ? [] : [{ id: item.saleUnitId, label: item.saleUnitLabel }]),
    ...(item.writeOffUnitId === null || item.writeOffUnitLabel === null || item.writeOffUnitId === item.saleUnitId ? [] : [{ id: item.writeOffUnitId, label: item.writeOffUnitLabel }]),
  ];
  return <section aria-label="Товар по фото накладной" style={{ color: t.ink, margin: '20px 0', maxWidth: 620, fontSize: 15, lineHeight: '23px' }}>
    <h2 style={{ margin: '0 0 12px', fontSize: 20, lineHeight: '27px' }}>Товар по фото накладной</h2>
    <p>Выберите одну строку, найдите существующий товар и проверьте поля. Приход потребует отдельного подтверждения в чате.</p>
    {view.phase === 'photo' ? <GoodsPhotoPicker disabled={locked} select={photo => void port.upload(photo)} t={t} /> : null}
    <p role="status" aria-live="polite" style={{ margin: '12px 0' }}>{view.busy === 'upload' ? 'Извлекаю предварительные строки…'
      : view.busy === 'search' ? 'Ищу товар в YCLIENTS…'
      : view.busy === 'detail' ? 'Проверяю сведения выбранного товара…'
      : view.busy === 'review' ? 'Готовлю предложение для проверки…'
      : failureText(view.failure)}</p>
    {view.lines.length > 0 ? <>
      <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>Предварительные строки</h3>
      <p>Каждую строку нужно сверить с документом. Смысл цены может быть не определён.</p>
      <ol style={{ paddingLeft: 22 }}>
        {view.lines.map(line => <li key={line.sourceLine} style={{ margin: '10px 0' }}>
          <span>{line.name ?? 'Название не определено'} · количество: {line.quantity ?? 'не определено'} · единица: {line.unitLabel ?? 'не определена'}</span>
          <p style={{ margin: '4px 0' }}>Поле цены: {line.unitPrice ?? 'не определено'}. Смысл: {line.priceKind === 'purchase_unit' ? 'Предварительная закупочная цена за единицу'
            : line.priceKind === 'sale_unit' ? 'Цена продажи (не закупочная)'
            : line.priceKind === 'line_total' ? 'Сумма строки (не цена за единицу)' : 'не определён'}. Отдельное поле суммы строки: {line.lineTotal ?? 'не определено'}.</p>
          <button type="button" disabled={locked} aria-pressed={view.selectedLine === line.sourceLine} onClick={() => port.selectLine(line.sourceLine)}
            style={{ padding: '8px 12px', border: '1px solid', borderRadius: 10, background: 'transparent', color: t.ink, font: 'inherit' }}>{view.selectedLine === line.sourceLine ? 'Строка выбрана' : `Выбрать строку ${line.sourceLine}`}</button>
        </li>)}
      </ol>
    </> : null}
    {selected === undefined ? null : <>
      <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>Найти товар для строки {selected.sourceLine}</h3>
      <Field label="Название, артикул или штрихкод" value={view.query} change={value => port.editQuery(value)} disabled={locked} t={t} />
      <button type="button" disabled={locked || !view.query.trim()} onClick={() => void port.search()}
        style={{ padding: '10px 14px', border: '1px solid', borderRadius: 10, background: 'transparent', color: t.ink, font: 'inherit' }}>Найти товар в YCLIENTS</button>
      {view.phase === 'matches' && view.busy === null && view.failure === null && view.matches.length === 0 ? <p>Совпадений в этом поиске нет. Уточните запрос.</p> : null}
      {view.matches.length > 0 ? <ul style={{ paddingLeft: 22 }}>
        {view.matches.map(match => <li key={`${match.kind}:${match.id}`} style={{ margin: '8px 0' }}>
          {match.kind === 'category' ? <span>{match.title} — категория</span> : <button type="button" disabled={locked} onClick={() => void port.selectItem(match.id)}
            style={{ padding: '8px 12px', border: '1px solid', borderRadius: 10, background: 'transparent', color: t.ink, font: 'inherit' }}>{match.title} · товар №{match.id}</button>}
        </li>)}
      </ul> : null}
      {view.mayHaveMore ? <p>Показана часть результатов. Уточните запрос.</p> : null}
    </>}
    {item === null ? null : <>
      <h3 style={{ fontSize: 16, margin: '18px 0 8px' }}>Проверка: {item.name}</h3>
      <p>Товар №{item.id}{item.article === null ? '' : ` · артикул ${item.article}`}{item.barcode === null ? '' : ` · штрихкод ${item.barcode}`}. Данные на {item.asOf}.</p>
      {item.itemKind !== 'physical' ? <p>Тип товара не подходит для подтверждённого прихода. Подготовка недоступна.</p> : <>
        <p>Введите закупочную цену из документа. Цена продажи и цены каталога в поля прихода не переносятся.</p>
        {item.stock.rows.length > 0 ? <p>В данных об остатках встречаются склады: {item.stock.rows.map(row => `№${row.storeId}`).join(', ')}. Названия и полный список складов здесь не получены; укажите нужный склад из YCLIENTS.</p> : <p>Сведения о складах не получены. Укажите точный номер склада из YCLIENTS.</p>}
        <Field label="Номер склада в YCLIENTS" value={view.review.storeId} change={storeId => edit({ storeId })} disabled={locked} t={t} />
        <Field label="Количество прихода" value={view.review.quantity} change={quantity => edit({ quantity })} disabled={locked} placeholder="Например, 1.25" t={t} />
        <p>Выберите единицу товара. Автоматического пересчёта единиц нет.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {units.map(unit => <button type="button" key={unit.id} disabled={locked} aria-pressed={view.review.unitId === unit.id} onClick={() => edit({ unitId: unit.id })}
            style={{ padding: '8px 12px', border: '1px solid', borderRadius: 10, background: view.review.unitId === unit.id ? t.ink : 'transparent', color: view.review.unitId === unit.id ? t.bg : t.ink, font: 'inherit' }}>{unit.label} · единица №{unit.id}</button>)}
        </div>
        {units.length === 0 ? <p>Единицы товара не определены. Подготовка недоступна.</p> : null}
        <Field label="Закупочная цена за выбранную единицу" value={view.review.unitCost} change={unitCost => edit({ unitCost })} disabled={locked} placeholder="Например, 12.50" t={t} />
        <Field label="Валюта закупочной цены" value={view.review.currency} change={currency => edit({ currency })} disabled={locked} placeholder="Трёхбуквенный код, например RUB" t={t} />
        <Field label="Дата и время прихода с часовым поясом" value={view.review.receivedAt} change={receivedAt => edit({ receivedAt })} disabled={locked} placeholder="YYYY-MM-DDTHH:mm:ss+HH:mm" t={t} />
        <button type="button" disabled={locked} aria-pressed={view.review.priceKind === 'receipt_purchase_unit'} onClick={() => edit({ priceKind: view.review.priceKind === '' ? 'receipt_purchase_unit' : '' })}
          style={{ padding: '10px 14px', border: '1px solid', borderRadius: 10, background: view.review.priceKind === '' ? 'transparent' : t.ink, color: view.review.priceKind === '' ? t.ink : t.bg, font: 'inherit' }}>{view.review.priceKind === '' ? 'Проверено: это закупочная цена за единицу' : 'Закупочная цена за единицу проверена'}</button>
        <p>Точная сумма появится в предложении. Проверьте его перед подтверждением.</p>
        <button type="button" disabled={locked || units.length === 0 || view.review.priceKind === ''} onClick={() => void port.review()}
          style={{ padding: '12px 16px', border: 0, borderRadius: 12, background: t.accent, color: t.accentOn, font: 'inherit' }}>Подготовить предложение прихода</button>
      </>}
    </>}
    {view.phase === 'reviewed' ? <p>Ответ MAYA находится в разговоре. Дальнейшее действие доступно в карточке, если предложение допускает подтверждение.</p> : null}
    <div style={{ margin: '16px 0' }}><button type="button" onClick={() => port.abort()}
      style={{ padding: '10px 0', border: 0, background: 'transparent', color: t.ink, font: 'inherit', textDecoration: 'underline' }}>Закрыть и очистить поля фото</button></div>
  </section>;
}
