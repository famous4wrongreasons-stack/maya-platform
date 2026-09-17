// K5 — data tables (A-17): CLIENT_LIST.table, REPORT sections[].table, CHART.table_equivalent.
//
// A TableSpec becomes a caption, programmatic column headers, the one row-header column, row-group
// headers when `group_by` is set, and `row_intents` as a real control inside the row — never a
// click handler on the row element. SCHEDULE is not drawn here: its body carries no TableSpec.
//
// Interactive order inside a table, which `render.ts`'s walker and the DOM host both follow: a row
// whose `row:<row_key>` is in the sealed reading order contributes that key once, in row order. Its
// in-row control, when the row has a row intent, is an ActionNode carrying the SAME ref, so the row
// is one tab stop whether or not it can be activated.

import type { InteractiveRefKey, Measure, Cell, TableSpec } from '../contract.ts';
import type { ActionNode, LeafNode, TableColumnNode, TableNode, TableRowGroupNode, TableRowNode } from './nodes.ts';
import { UnreadableEnvelope, valueLeaf } from './cells.ts';

export interface TableContext {
  /** True when the key is in the sealed `reading_order`. */
  readonly inOrder: (key: InteractiveRefKey) => boolean;
  /** The in-row control for an emitted intent under a row ref; null when the intent was not emitted. */
  readonly rowAction: (intentRef: string, ref: InteractiveRefKey) => ActionNode | null;
}

/** The one column whose `is_row_header` is true. A table with none, or with two, is unreadable. */
export const headerColumnOf = (spec: TableSpec): string => {
  const headers = spec.columns.filter((c) => c.is_row_header);
  const only = headers[0];
  if (headers.length !== 1 || only === undefined) throw new UnreadableEnvelope('a table needs exactly one row-header column');
  return only.key;
};

const groupValue = (cell: Cell<string> | Measure | null | undefined): string | null => {
  if (cell === null || cell === undefined) return null;
  const v = cell.value;
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
};

/**
 * Draw a TableSpec. `interactive` is false where the rows are not part of the drawn reading order
 * (CHART's prose branch draws its degraded rows as their own controls after the table).
 */
export const drawTable = (spec: TableSpec, ctx: TableContext, interactive: boolean): TableNode => {
  const headerKey = headerColumnOf(spec);
  const columns: TableColumnNode[] = spec.columns.map((c) => ({
    key: c.key,
    label: c.label.rendered,
    align: c.align ?? (c.type === 'measure' ? 'end' : 'start'),
  }));

  const drawRow = (row: TableSpec['rows'][number]): TableRowNode => {
    const key: InteractiveRefKey = `row:${row.row_key}`;
    const ref = interactive && ctx.inOrder(key) ? key : null;
    const cells: (LeafNode | null)[] = spec.columns.map((c) => {
      const cell = row.cells[c.key];
      return cell === null || cell === undefined ? null : valueLeaf(cell);
    });
    if (cells[spec.columns.findIndex((c) => c.key === headerKey)] === null)
      throw new UnreadableEnvelope('a row-header cell is never absent and never null');
    const intentRef = spec.row_intents?.[row.row_key];
    const action = ref !== null && intentRef !== undefined ? ctx.rowAction(intentRef, ref) : null;
    return { row_key: row.row_key, ref, cells, actions: action === null ? [] : [action] };
  };

  // Row groups are contiguous runs of the group column's value, in body order, so grouping never
  // reorders rows and the row keys stay in the order the reading order names them.
  const groups: TableRowGroupNode[] = [];
  const by = spec.group_by;
  let current: { value: string | null; label: string | null; rows: TableRowNode[] } | null = null;
  for (const row of spec.rows) {
    const value = by === null ? null : groupValue(row.cells[by.key]);
    if (current === null || current.value !== value) {
      const label: string | null = by === null || value === null ? null : (by.group_labels[value]?.rendered ?? null);
      current = { value, label, rows: [] };
      groups.push({ label, rows: current.rows });
    }
    current.rows.push(drawRow(row));
  }

  return { t: 'table', caption: spec.caption.rendered, columns, rowHeaderKey: headerKey, groups };
};
