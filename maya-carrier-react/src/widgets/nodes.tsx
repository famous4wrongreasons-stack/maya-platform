// The node walk: one React element per RenderNode, transcribed from dom/host.ts's drawNode.
//
// `src/dom/**` is the declared DOM boundary and the carrier may never import it, so this is a
// re-implementation, not a wrapper. It follows the DOM drawer element for element, attribute for
// attribute, because the two must produce the same accessibility tree — proven in test/parity.mjs
// against all 40 sealed fixtures.
//
// The rules that are not obvious, and that a plausible-looking drawer gets wrong:
//
//   * R-3 — the renderer composes no user-visible text. EVERY string below is copied from the node.
//     A null table cell is an empty cell, never an em dash; a non-KNOWN state is already stated in
//     the minted label, so it is never colour alone.
//   * `enabled` is DRAWN, never decided. An unusable action keeps its click handler and gets
//     `aria-disabled` plus its explanation — never the `disabled` attribute, which would take the
//     control out of the tab order and make the reason unreachable.
//   * A table row is never clickable (A-17). Its single tab stop is its in-row button when it has
//     one, otherwise its own row header.
//   * A ChoiceNode with `selects === null` and every FieldNode are still in the reading order:
//     reachable, never activatable. Dropping them breaks A-0 for every fixture that has one.
//   * A bad verdict is not an error surface. It arrives as `mode: 'frozen_prose'` and a thinner
//     node list; `role="alert"` is forbidden.

import type {
  ActionNode,
  BlockNode,
  ChoiceNode,
  FieldNode,
  LeafNode,
  LimitationNode,
  RenderNode,
  TableNode,
} from '../../../maya-chat-shell/src/renderer/nodes.ts';
import type { InteractiveRefKey } from '../../../maya-chat-shell/src/contract.ts';
import type { WidgetTheme } from '../identity/widgetTheme.ts';

/** Where a node is being drawn, which decides two element choices. dom/host.ts Place. */
export type Place = 'block' | 'inline' | 'list';

export interface DrawCtx {
  readonly c: WidgetTheme;
  readonly names: ReadonlyMap<string, string>;
  readonly pending: InteractiveRefKey | null;
  readonly activate: (ref: InteractiveRefKey) => void;
}

/** host.ts:325 — text and leaf are the only nodes that may sit inline. */
const INLINE_NODES = new Set(['text', 'leaf']);

/** The sealed name, byte for byte, and only when the visible text differs. host.ts:121-123 */
const nameOf = (name: string, visible: string): string | undefined =>
  name !== '' && name !== visible ? name : undefined;

// ── the owner's card grammar (app.html:16283 onward), as style fragments ───────────────────────

/**
 * The owner's option row (app.html:16326) — radius 14, `line2` edge, `bg2` ground — with the
 * shell's flow for its contents: `flex-wrap: wrap; gap: 0.25rem 0.5rem` (entry/styles.css:766).
 * The wrap matters. A choice carries an arbitrary number of server leaves, and the owner's own row
 * was flex because it had exactly two; without wrapping, four leaves squeeze into slivers.
 */
const optionRow = (c: WidgetTheme) => ({
  width: '100%',
  minHeight: 46,
  borderRadius: 14,
  border: '1px solid ' + c.line2,
  background: c.bg2,
  color: c.ink,
  padding: '10px 13px',
  display: 'flex',
  flexWrap: 'wrap' as const,
  alignItems: 'baseline',
  gap: '4px 8px',
  textAlign: 'start' as const,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12.5,
  lineHeight: 1.45,
  overflowWrap: 'break-word' as const,
});

const primaryButton = (c: WidgetTheme) => ({
  width: '100%',
  minHeight: 44,
  borderRadius: 999,
  border: '0',
  background: c.invBg,
  color: c.invText,
  fontSize: 10.5,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '12px 16px',
});

const quietButton = (c: WidgetTheme) => ({
  width: '100%',
  minHeight: 44,
  borderRadius: 999,
  background: 'transparent',
  color: c.ink,
  border: '1px solid ' + c.line2,
  fontSize: 10.5,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '12px 16px',
});

/** The owner's primary is the inverted pill; every other role is the quiet one. */
const isPrimary = (role: string): boolean => role === 'primary' || role === 'handoff';

// ── leaf ───────────────────────────────────────────────────────────────────────────────────────

export function Leaf({ leaf, c }: { readonly leaf: LeafNode; readonly c: WidgetTheme }) {
  const notKnown = leaf.state !== null && leaf.state !== 'KNOWN';
  return (
    <span
      className={'leaf leaf--' + leaf.source + (notKnown ? ' leaf--not-known' : '')}
      style={{ color: notKnown ? c.muted : 'inherit' }}
    >
      {leaf.text}
      {leaf.detail === null ? null : (
        <>
          {' '}
          <span className="leaf-detail" style={{ color: c.faint }}>
            {leaf.detail}
          </span>
        </>
      )}
    </span>
  );
}

// ── action ─────────────────────────────────────────────────────────────────────────────────────

function Action({ node, ctx, k }: { readonly node: ActionNode; readonly ctx: DrawCtx; readonly k: string }) {
  const { c } = ctx;
  const blocked = node.explanation !== null;
  const whyId = 'why-' + node.ref.replace(':', '-');
  const shape = isPrimary(node.role) ? primaryButton(c) : quietButton(c);
  return (
    <>
      <button
        key={k}
        type="button"
        className={'widget-action widget-action--' + node.role.toLowerCase()}
        data-ref={node.ref}
        aria-label={nameOf(node.name, node.label)}
        aria-describedby={blocked ? whyId : undefined}
        aria-disabled={blocked || ctx.pending === node.ref ? 'true' : undefined}
        onClick={() => ctx.activate(node.ref)}
        style={{ ...shape, opacity: blocked ? 0.55 : 1 }}
      >
        {node.label}
      </button>
      {node.explanation === null ? null : (
        <span
          className="widget-explanation"
          id={whyId}
          style={{ display: 'block', marginTop: 4, fontSize: 11.5, lineHeight: 1.45, color: c.muted }}
        >
          <Leaf leaf={node.explanation} c={c} />
        </span>
      )}
    </>
  );
}

// ── choice ─────────────────────────────────────────────────────────────────────────────────────

function Choice({ node, ctx, k }: { readonly node: ChoiceNode; readonly ctx: DrawCtx; readonly k: string }) {
  const { c } = ctx;
  const inner = node.children.map((child, i) => drawNode(child, 'inline', `${k}.${i}`, ctx));
  if (node.selects !== null) {
    return (
      <button
        key={k}
        type="button"
        className="widget-choice"
        data-ref={node.ref}
        aria-label={node.name === '' ? undefined : node.name}
        aria-disabled={ctx.pending === node.ref ? 'true' : undefined}
        onClick={() => ctx.activate(node.ref)}
        style={{ ...optionRow(c) }}
      >
        {inner}
      </button>
    );
  }
  // A body element the reading order names and no intent selects: reachable, never activatable.
  return (
    <div
      key={k}
      className="widget-choice widget-choice--static"
      role="group"
      tabIndex={0}
      data-ref={node.ref}
      aria-label={node.name === '' ? undefined : node.name}
      style={{
        ...optionRow(c),
        cursor: 'default',
        minHeight: 44,
        background: 'transparent',
        border: '1px dashed ' + c.line2,
      }}
    >
      {inner}
    </div>
  );
}

// ── field ──────────────────────────────────────────────────────────────────────────────────────

function Field({ node, ctx, k }: { readonly node: FieldNode; readonly ctx: DrawCtx; readonly k: string }) {
  const { c } = ctx;
  return (
    <div
      key={k}
      className={
        'widget-field widget-field--' + node.input + (node.refused ? ' widget-field--refused' : '')
      }
      role="group"
      tabIndex={0}
      data-ref={node.ref}
      aria-label={node.name === '' ? undefined : node.name}
      aria-invalid={node.refused ? 'true' : undefined}
      style={{
        padding: '10px 13px',
        borderRadius: 14,
        minHeight: 44,
        border: node.refused ? '2px solid ' + c.errc : '1px dashed ' + c.line2,
        background: 'transparent',
      }}
    >
      {node.help.map((help, i) => (
        <p
          key={`${k}.h${i}`}
          className="widget-field-help"
          style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: c.muted }}
        >
          {drawNode(help, 'inline', `${k}.h${i}.0`, ctx)}
        </p>
      ))}
      {node.value === null ? null : (
        <p
          className="widget-field-value"
          style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.4, color: c.ink }}
        >
          <Leaf leaf={node.value} c={c} />
        </p>
      )}
    </div>
  );
}

// ── table ──────────────────────────────────────────────────────────────────────────────────────

function WidgetTable({ node, ctx, k }: { readonly node: TableNode; readonly ctx: DrawCtx; readonly k: string }) {
  const { c } = ctx;
  const withActions = node.groups.some((g) => g.rows.some((r) => r.actions.length > 0));
  const span = node.columns.length + (withActions ? 1 : 0);
  const cellStyle = { padding: '8px 10px', borderTop: '1px solid ' + c.line, fontSize: 12.5 };
  return (
    // A-10: a wide table scrolls inside its own container, never the page.
    <div
      key={k}
      className="widget-table-scroll"
      style={{ maxWidth: '100%', overflowX: 'auto', overscrollBehaviorX: 'contain' }}
    >
      {/*
        A-10 again: the point of the scroll container is that a wide table SCROLLS. The article sets
        `overflow-wrap: anywhere`, which inside a table lets the browser shrink columns to fit
        instead — "Мастер" breaks to "Мас/тер" and nothing ever scrolls. Normal wrapping here, and
        header cells on one line, so the table takes the width it needs and the container carries it.
      */}
      <table
        className="widget-table"
        style={{ minWidth: '100%', borderCollapse: 'collapse', color: c.ink, overflowWrap: 'normal' }}
      >
        <caption
          style={{
            captionSide: 'top',
            textAlign: 'start',
            fontSize: 9,
            letterSpacing: '0.26em',
            textTransform: 'uppercase',
            color: c.muted,
            paddingBottom: 8,
          }}
        >
          {node.caption}
        </caption>
        <thead>
          <tr>
            {node.columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === 'end' ? 'cell--end' : undefined}
                style={{ ...cellStyle, borderTop: '0', textAlign: column.align, fontWeight: 500, color: c.muted, whiteSpace: 'nowrap' }}
              >
                {column.label}
              </th>
            ))}
            {withActions ? (
              <th scope="col" style={{ ...cellStyle, borderTop: '0' }}>
                <span className="vh">Действия</span>
              </th>
            ) : null}
          </tr>
        </thead>
        {node.groups.map((group, gi) => (
          <tbody key={`${k}.g${gi}`}>
            {group.label === null ? null : (
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={span}
                  style={{ ...cellStyle, textAlign: 'start', fontWeight: 500, color: c.muted }}
                >
                  {group.label}
                </th>
              </tr>
            )}
            {group.rows.map((row, ri) => {
              const rowOwn = row.actions.find((a) => a.ref === row.ref) ?? null;
              return (
                <tr key={`${k}.g${gi}.r${ri}`}>
                  {node.columns.map((column, index) => {
                    const leaf = row.cells.at(index) ?? null;
                    const isHeader = column.key === node.rowHeaderKey;
                    // A row in the reading order is ONE tab stop: its in-row control when it has
                    // one, else its row header. Never a handler on the row (A-17).
                    const stop = isHeader && row.ref !== null && rowOwn === null;
                    const body = leaf === null ? null : <Leaf leaf={leaf} c={c} />;
                    const shared = {
                      ...cellStyle,
                      textAlign: column.align,
                      ...(isHeader ? { fontWeight: 500, whiteSpace: 'nowrap' as const } : null),
                    };
                    return isHeader ? (
                      <th
                        key={column.key}
                        scope="row"
                        className={column.align === 'end' ? 'cell--end' : undefined}
                        tabIndex={stop ? 0 : undefined}
                        data-ref={stop && row.ref !== null ? row.ref : undefined}
                        aria-label={stop && row.ref !== null ? ctx.names.get(row.ref) : undefined}
                        style={{ ...shared }}
                      >
                        {body}
                      </th>
                    ) : (
                      <td
                        key={column.key}
                        className={column.align === 'end' ? 'cell--end' : undefined}
                        style={{ ...shared }}
                      >
                        {body}
                      </td>
                    );
                  })}
                  {withActions ? (
                    <td className="widget-row-actions" style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                      {row.actions.map((rowAction, ai) => (
                        <Action key={`${k}.g${gi}.r${ri}.a${ai}`} node={rowAction} ctx={ctx} k={`${k}.g${gi}.r${ri}.a${ai}`} />
                      ))}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ── block ──────────────────────────────────────────────────────────────────────────────────────

function Block({ node, place, ctx, k }: { readonly node: BlockNode; readonly place: Place; readonly ctx: DrawCtx; readonly k: string }) {
  const inner: Place =
    node.block === 'list' || node.block === 'ordered_list'
      ? 'list'
      : node.block === 'paragraph'
        ? 'inline'
        : 'block';
  const children = node.children.map((child, i) => drawNode(child, inner, `${k}.${i}`, ctx));
  const className = 'widget-block widget-block--' + node.block;
  const label = node.label === null ? undefined : node.label;

  if (node.block === 'group')
    return (
      <div
        key={k}
        className={className + (node.roleHint === null ? '' : ' hint--' + node.roleHint)}
        role="group"
        aria-label={label}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        {children}
      </div>
    );
  if (node.block === 'list')
    return (
      <ul key={k} className={className} aria-label={label} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </ul>
    );
  if (node.block === 'ordered_list')
    return (
      <ol key={k} className={className} aria-label={label} style={{ margin: 0, paddingInlineStart: 20 }}>
        {children}
      </ol>
    );
  if (node.block === 'item')
    return place === 'list' ? (
      <li key={k} className={className} aria-label={label} style={{ margin: 0 }}>
        {children}
      </li>
    ) : (
      <div key={k} className={className} aria-label={label} style={{ margin: 0 }}>
        {children}
      </div>
    );
  // paragraph → <p> only when every child may sit inline, else <div>. host.ts:300
  // Independent sealed leaves need the same wrapping gap as an option row; no text is inserted.
  return node.children.every((child) => INLINE_NODES.has(child.t)) ? (
    <p key={k} className={className} aria-label={label} style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px', fontSize: 13.5, lineHeight: 1.5, color: ctx.c.ink }}>
      {children}
    </p>
  ) : (
    <div key={k} className={className} aria-label={label} style={{ marginTop: 8 }}>
      {children}
    </div>
  );
}

// ── limitation ─────────────────────────────────────────────────────────────────────────────────

function Limitation({ node, c, k }: { readonly node: LimitationNode; readonly c: WidgetTheme; readonly k: string }) {
  // Severity is a word in the minted text, never colour alone — and never role="alert".
  const loud = node.severity === 'blocking' || node.severity === 'risk';
  return (
    <p
      key={k}
      className={'widget-limitation widget-limitation--' + node.severity}
      style={{
        margin: 0,
        padding: '10px 13px',
        borderRadius: 14,
        border: '1px solid ' + (loud ? c.errc : c.line),
        background: c.surf,
        fontSize: 12.5,
        lineHeight: 1.45,
        color: loud ? c.errc : c.muted,
      }}
    >
      {node.text}
    </p>
  );
}

// ── the dispatch ───────────────────────────────────────────────────────────────────────────────

export function drawNode(node: RenderNode, place: Place, k: string, ctx: DrawCtx) {
  switch (node.t) {
    case 'text':
      return place === 'inline' ? (
        <span key={k}>{node.text}</span>
      ) : (
        <p key={k} className="widget-text" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: ctx.c.ink }}>
          {node.text}
        </p>
      );
    case 'leaf':
      return place === 'inline' ? (
        <Leaf key={k} leaf={node} c={ctx.c} />
      ) : (
        <p key={k} className="widget-leaf-line" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: ctx.c.ink }}>
          <Leaf leaf={node} c={ctx.c} />
        </p>
      );
    case 'heading': {
      const shared = {
        margin: 0,
        fontSize: node.level === 2 ? 17 : node.level === 3 ? 14 : 12.5,
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
        fontWeight: 500,
        color: ctx.c.ink,
      };
      if (node.level === 2)
        return (
          <h2 key={k} className="widget-heading" tabIndex={-1} style={{ ...shared }}>
            {node.text}
          </h2>
        );
      if (node.level === 3)
        return (
          <h3 key={k} className="widget-heading" tabIndex={-1} style={{ ...shared }}>
            {node.text}
          </h3>
        );
      return (
        <h4 key={k} className="widget-heading" tabIndex={-1} style={{ ...shared }}>
          {node.text}
        </h4>
      );
    }
    case 'block':
      return <Block key={k} node={node} place={place} ctx={ctx} k={k} />;
    case 'action':
      return <Action key={k} node={node} ctx={ctx} k={k} />;
    case 'choice':
      return <Choice key={k} node={node} ctx={ctx} k={k} />;
    case 'field':
      return <Field key={k} node={node} ctx={ctx} k={k} />;
    case 'table':
      return <WidgetTable key={k} node={node} ctx={ctx} k={k} />;
    case 'limitation':
      return <Limitation key={k} node={node} c={ctx.c} k={k} />;
  }
}
