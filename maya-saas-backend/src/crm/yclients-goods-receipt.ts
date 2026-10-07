import { CrmOutcomeUnknownError } from './crm-request.errors';
import {
  exactDecimal,
  goodsHash,
  goodsRefuse,
  preparedGoods,
  receiptContextFacts,
  type GoodsReceiptContext,
  type GoodsReceiptResult,
} from './goods-receipt.contract';
import { goodsId, type GoodsItemRead } from './yclients-goods-read';

/** Finite wire shape from the pinned official OpenAPI schema, not its conflicting example. */
export type YclientsGoodsReceiptBody = {
  type_id: 3;
  storage_id: number;
  create_date: string;
  goods_transactions: [
    {
      good_id: number;
      operation_unit_type: 1 | 2;
      amount: number;
      cost_per_unit: number;
      discount: 0;
      cost: number;
    },
  ];
};
export class YclientsGoodsReceiptUnknownError extends CrmOutcomeUnknownError {
  constructor(
    readonly acknowledgedDocumentId: string | null,
    cause?: unknown,
  ) {
    super(
      'YCLIENTS goods receipt outcome is unknown; manual reconciliation required.',
      cause,
    );
    this.name = 'YclientsGoodsReceiptUnknownError';
  }
}
export const YCLIENTS_RECEIPT_SCOPE_BLOCKERS = [
  'yclients_receipt_storages_ids_semantics_undocumented',
  'yclients_receipt_storages_transactions_types_semantics_undocumented',
] as const;
/** Preserve source decimal tokens before JSON.parse can round them. JSON string
 * tokens are left untouched; the native parser still validates the full grammar.
 * Used only by the goods reader/receipt transport, never on an outbound body. */
export function parseGoodsResponseJson(raw: string): unknown {
  // Validate the original grammar before quoting numbers: otherwise an invalid
  // numeric object key could become valid. Discard the rounded parse result.
  JSON.parse(raw);
  const exact = raw.replace(
    /"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token) => (token.startsWith('"') ? token : JSON.stringify(token)),
  );
  return JSON.parse(exact) as unknown;
}
export function receiptObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    goodsRefuse('yclients_receipt_provider_object_unavailable');
  return value as Record<string, unknown>;
}
function exactIntegerToken(value: unknown, expected: number): boolean {
  return value === expected || value === String(expected);
}
export function yclientsReceiptContext(
  goods: GoodsItemRead,
  storageData: unknown,
  permissionData: unknown,
  companyId: string,
  storeId: string,
): GoodsReceiptContext {
  const company = goodsId(companyId),
    store = goodsId(storeId);
  if (goods.company_id !== company)
    goodsRefuse('yclients_receipt_company_mismatch');
  if (!Array.isArray(storageData) || storageData.length > 1000)
    goodsRefuse('yclients_receipt_storages_unavailable');
  const stores = storageData.map(receiptObject);
  const ids = stores.map((s) => goodsId(s.id));
  if (new Set(ids).size !== ids.length)
    goodsRefuse('yclients_receipt_ambiguous_store');
  const selected = stores.find((s) => goodsId(s.id) === store);
  if (
    !selected ||
    typeof selected.title !== 'string' ||
    !selected.title.trim() ||
    selected.title.length > 512 ||
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(selected.title)
  )
    goodsRefuse('yclients_receipt_exact_store_unavailable');
  const permissions = receiptObject(receiptObject(permissionData).storages);
  for (const key of [
    'storages_access',
    'storages_transactions_access',
    'storages_create_transactions_access',
    'storages_create_transactions_buy_access',
  ])
    if (permissions[key] !== true)
      goodsRefuse('yclients_receipt_provider_permission_denied');
  const blockers: string[] = [...YCLIENTS_RECEIPT_SCOPE_BLOCKERS];
  // No tenant-timezone/day-boundary assumption. Only the documented -1 is unrestricted.
  if (
    !exactIntegerToken(permissions.storages_last_days_count, -1) ||
    !exactIntegerToken(permissions.storages_create_last_days_count, -1)
  )
    blockers.push('yclients_receipt_permission_day_window_unqualified');
  // The pinned schema says array<object> without member fields; the rendered
  // table says boolean, and the sole sample [] does not specify all vs none.
  // An accessible store or a buy flag cannot resolve that missing scope contract.
  const projection = Object.fromEntries(
    [
      'storages_access',
      'storages_transactions_access',
      'storages_create_transactions_access',
      'storages_create_transactions_buy_access',
      'storages_last_days_count',
      'storages_create_last_days_count',
      'storages_ids',
      'storages_transactions_types',
    ].map((key) => [key, permissions[key] ?? null]),
  );
  if (JSON.stringify(projection).length > 16384)
    goodsRefuse('yclients_receipt_permission_projection_unbounded');
  return {
    goods,
    store: { id: store, name: selected.title.trim(), company_id: company },
    can_receive: false,
    permission_revision: goodsHash(projection),
    blockers,
  };
}
/** Guard exact JSON number serialization, including loss of fractional precision. */
export function receiptWireNumber(value: unknown): number {
  const decimal = exactDecimal(value);
  const number = Number(decimal);
  if (
    !Number.isFinite(number) ||
    exactDecimal(JSON.stringify(number)) !== decimal
  )
    goodsRefuse('yclients_receipt_decimal_not_exact_on_wire');
  return number;
}
function operationUnit(
  args: Record<string, unknown>,
  context: GoodsReceiptContext,
): 1 | 2 {
  const item = context.goods.item;
  if (item.sale_unit_id === item.write_off_unit_id && item.unit_ratio !== '1')
    goodsRefuse('yclients_receipt_unit_mapping_ambiguous');
  if (args.unit_id === item.sale_unit_id) return 1;
  if (args.unit_id === item.write_off_unit_id) return 2;
  return goodsRefuse('yclients_receipt_unit_mapping_unavailable');
}
export function yclientsReceiptBody(
  value: unknown,
  context: GoodsReceiptContext,
): YclientsGoodsReceiptBody {
  const args = preparedGoods(value);
  const facts = receiptContextFacts(context, args, String(args.company_id));
  if (
    !args.current_revision ||
    facts.current_revision !== args.current_revision
  )
    goodsRefuse('yclients_receipt_source_changed');
  return {
    type_id: 3,
    storage_id: Number(goodsId(args.store_id)),
    create_date: String(args.received_at),
    // Inline schema is array<object>; no existing document_id is fabricated.
    // The operation creates the document and its lines in one provider request.
    goods_transactions: [
      {
        good_id: Number(goodsId(args.goods_id)),
        operation_unit_type: operationUnit(args, context),
        amount: receiptWireNumber(args.quantity),
        cost_per_unit: receiptWireNumber(args.unit_cost),
        discount: 0,
        cost: receiptWireNumber(args.line_total),
      },
    ],
  };
}
function instant(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !==
      value.slice(0, 10)
  )
    throw new Error('yclients_receipt_timestamp_not_schema_qualified');
  return Date.parse(value);
}
export function yclientsReceiptDocument(
  value: unknown,
  args: Record<string, unknown>,
  expectedId?: string,
): string {
  const doc = receiptObject(value),
    id = goodsId(doc.id);
  if (
    (expectedId !== undefined && id !== goodsId(expectedId)) ||
    !exactIntegerToken(doc.type_id, 3) ||
    goodsId(doc.company_id) !== args.company_id ||
    goodsId(doc.storage_id) !== args.store_id ||
    instant(doc.create_date) !== instant(args.received_at)
  )
    throw new Error('yclients_receipt_document_mismatch');
  return id;
}
/** Exact document-attributed line; never infer success from a matching current stock balance. */
export function yclientsReceiptReadback(
  documentData: unknown,
  transactionsData: unknown,
  documentId: string,
  value: unknown,
  operationUnitType: 1 | 2,
): GoodsReceiptResult {
  const args = preparedGoods(value);
  const id = yclientsReceiptDocument(documentData, args, documentId);
  if (!Array.isArray(transactionsData) || transactionsData.length !== 1)
    throw new Error('yclients_receipt_lines_incomplete_or_ambiguous');
  const line = receiptObject(transactionsData[0]);
  goodsId(line.id);
  if (
    goodsId(line.document_id) !== id ||
    !exactIntegerToken(line.type_id, 3) ||
    goodsId(line.company_id) !== args.company_id ||
    goodsId(line.good_id) !== args.goods_id ||
    goodsId(line.storage_id) !== args.store_id ||
    goodsId(line.unit_id) !== args.unit_id ||
    !exactIntegerToken(line.operation_unit_type, operationUnitType) ||
    line.deleted !== false ||
    exactDecimal(line.amount, true) !== args.quantity ||
    exactDecimal(line.cost_per_unit) !== args.unit_cost ||
    exactDecimal(line.discount) !== '0' ||
    exactDecimal(line.cost) !== args.line_total ||
    instant(line.create_date) !== instant(args.received_at)
  )
    throw new Error('yclients_receipt_attributed_line_mismatch');
  return {
    receipt_id: id,
    observed: {
      company_id: goodsId(line.company_id),
      goods_id: goodsId(line.good_id),
      store_id: goodsId(line.storage_id),
      quantity: exactDecimal(line.amount, true),
      unit_id: goodsId(line.unit_id),
      unit_cost: exactDecimal(line.cost_per_unit),
      line_total: exactDecimal(line.cost),
      // The API documents no currency field here. This is the revalidated tenant
      // setting, not a claimed provider-echoed currency or a RUB default.
      currency: String(args.currency),
      received_at: String(args.received_at),
    },
  };
}
