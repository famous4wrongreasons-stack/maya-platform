// Shared READ-only chrome for live and restored canonical receipts.
import type { Tokens } from '../identity/tokens.ts';
import { widgetTheme } from '../identity/widgetTheme.ts';

export function ReceiptRefresh({ item, t, refreshBookingReceipt }: {
  readonly item: { readonly id: string; readonly receiptRefresh?: 'available' | 'pending' | 'unavailable' | null };
  readonly t: Tokens;
  readonly refreshBookingReceipt?: ((itemId: string) => void) | undefined;
}) {
  const c = widgetTheme(t);
  return (<>
      {item.receiptRefresh == null || refreshBookingReceipt === undefined ? null : (
        <div className="widget-receipt-refresh" style={{ marginTop: 8, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' }}>
          <button
            type="button"
            disabled={item.receiptRefresh === 'pending'}
            aria-busy={item.receiptRefresh === 'pending' ? 'true' : undefined}
            onClick={() => {
              if (item.receiptRefresh !== 'pending') refreshBookingReceipt(item.id);
            }}
            style={{ padding: '10px 12px', border: '1px solid ' + c.line, borderRadius: 12, background: 'transparent', color: c.ink, font: 'inherit', fontSize: 13, cursor: item.receiptRefresh === 'pending' ? 'default' : 'pointer' }}
          >
            {item.receiptRefresh === 'pending' ? 'Проверяем результат…' : 'Проверить результат'}
          </button>
          <p role="status" style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.45, color: c.muted }}>
            {item.receiptRefresh === 'unavailable' ? 'Не удалось проверить результат. Попробуйте ещё раз.' : ''}
          </p>
        </div>
      )}
  </>);
}
