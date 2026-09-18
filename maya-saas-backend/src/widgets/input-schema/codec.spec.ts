// U8b-c — the field-keyed `selection_domain` codec and the labels decode. Class [U] (§0.5).

import {
  EMPTY_SELECTION_DOMAIN,
  decodeSelectionDomain,
  decodeSelectionDomainLabels,
  encodeSelectionDomain,
  type SelectionDomain,
} from './codec';

const encoded = (domain: unknown): string => {
  const result = encodeSelectionDomain(domain);
  if (!result.ok)
    throw new Error(`encode failed: ${JSON.stringify(result.defects)}`);
  return result.value;
};

const decoded = (value: unknown): SelectionDomain => {
  const result = decodeSelectionDomain(value);
  if (!result.ok)
    throw new Error(`decode failed: ${JSON.stringify(result.defects)}`);
  return result.value;
};

const plain = (domain: SelectionDomain): Record<string, string[]> =>
  Object.fromEntries([...domain].map(([field, ids]) => [field, [...ids]]));

describe('U8b-c — the selection_domain codec', () => {
  it('SD-1 [U] round-trips a field-keyed domain, and the round trip is exact', () => {
    const domain = { slot: ['b2', 'b1'], staff: ['s9'] };
    const wire = encoded(domain);
    expect(plain(decoded(wire))).toEqual({ slot: ['b1', 'b2'], staff: ['s9'] });
    // Encoding what was decoded gives the same bytes back: the two directions are one definition.
    expect(encoded(decoded(wire))).toBe(wire);
  });

  it('SD-2 [U] is canonical in both axes: field order and option order are not information', () => {
    // Gate 10’s SUPERSEDED comparison reads `selection_domain` as a STRING (C11:4514-4515). Two equal
    // domains must therefore have exactly one spelling.
    expect(encoded({ slot: ['b2', 'b1'] })).toBe(
      encoded({ slot: ['b1', 'b2'] }),
    );
    expect(encoded({ a: ['x'], b: ['y'] })).toBe(
      encoded({ b: ['y'], a: ['x'] }),
    );
    expect(encoded({ slot: ['b1', 'b2'] })).toBe('{"slot":["b1","b2"]}');
  });

  it('SD-3 [U] refuses a duplicate option id on both sides: selections are sets (B-11/AMB-20)', () => {
    const enc = encodeSelectionDomain({ slot: ['b1', 'b1'] });
    expect(enc.ok).toBe(false);
    expect(!enc.ok && enc.defects.map((d) => d.at)).toEqual(['.slot[1]']);
    // And a stored string carrying one is refused rather than silently de-duplicated.
    const dec = decodeSelectionDomain('{"slot":["b1","b1"]}');
    expect(dec.ok).toBe(false);
    expect(
      !dec.ok && dec.defects.some((d) => d.why === 'duplicate option id'),
    ).toBe(true);
  });

  it('SD-4 [U] refuses a non-canonical stored spelling rather than accepting it', () => {
    expect(decodeSelectionDomain('{"slot":["b2","b1"]}').ok).toBe(false);
    expect(decodeSelectionDomain('{"b":["y"],"a":["x"]}').ok).toBe(false);
    // The canonical spellings of the same two documents decode.
    expect(decodeSelectionDomain('{"slot":["b1","b2"]}').ok).toBe(true);
    expect(decodeSelectionDomain('{"a":["x"],"b":["y"]}').ok).toBe(true);
  });

  it('SD-5 [U] refuses what a conformant minter could not have written', () => {
    for (const value of [
      null,
      undefined,
      7,
      {},
      '[]',
      'not json',
      '{"slot":"b1"}',
      '{"slot":[1]}',
      '{"slot":[""]}',
      '{"":["b1"]}',
    ]) {
      const shown = JSON.stringify(value) ?? 'undefined';
      expect(`${shown}: ${decodeSelectionDomain(value).ok}`).toBe(
        `${shown}: false`,
      );
    }
  });

  it('SD-6 [U] a record that offers no selection still stores the canonical empty domain', () => {
    expect(encoded({})).toBe(EMPTY_SELECTION_DOMAIN);
    expect([...decoded(EMPTY_SELECTION_DOMAIN).keys()]).toEqual([]);
    // A field with an EMPTY closed set is well formed here. Gate 8 then refuses every selection on it
    // (AREA-A G8 §5.0: the pre-U0 function passed every value on an empty domain, which is the bug).
    expect(encoded({ slot: [] })).toBe('{"slot":[]}');
    expect(plain(decoded('{"slot":[]}'))).toEqual({ slot: [] });
  });

  it('SD-7 [U] refuses an empty field name and a non-string id at encode time too', () => {
    expect(encodeSelectionDomain({ '': ['b1'] }).ok).toBe(false);
    expect(encodeSelectionDomain({ slot: [1] }).ok).toBe(false);
    expect(encodeSelectionDomain({ slot: 'b1' }).ok).toBe(false);
    expect(encodeSelectionDomain('nope').ok).toBe(false);
  });

  it('SD-8 [U] accepts the Map-of-Sets shape the decoder returns, so mint and gate share one encoder', () => {
    const map = new Map([['slot', new Set(['b2', 'b1'])]]);
    expect(encoded(map)).toBe('{"slot":["b1","b2"]}');
  });
});

describe('U8b-c — the selection_domain labels decode', () => {
  it('LB-1 [U] decodes field → option id → label (C11:4546)', () => {
    const result = decodeSelectionDomainLabels({
      slot: { b1: '10:00', b2: '10:30' },
      staff: { s9: 'Илья' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get('slot')?.get('b2')).toBe('10:30');
    expect(result.value.get('staff')?.get('s9')).toBe('Илья');
    expect([...result.value.keys()]).toEqual(['slot', 'staff']);
  });

  it('LB-2 [U] refuses a FLAT map: an option id is only meaningful inside its field (AMB-17)', () => {
    const flat = decodeSelectionDomainLabels({ b1: '10:00', b2: '10:30' });
    expect(flat.ok).toBe(false);
    expect(!flat.ok && flat.defects.map((d) => d.at)).toEqual(['.b1', '.b2']);
  });

  it('LB-3 [U] refuses a label that is not a non-empty string, and a third level of nesting', () => {
    expect(decodeSelectionDomainLabels({ slot: { b1: '' } }).ok).toBe(false);
    expect(decodeSelectionDomainLabels({ slot: { b1: 3 } }).ok).toBe(false);
    expect(
      decodeSelectionDomainLabels({ slot: { b1: { ru: '10:00' } } }).ok,
    ).toBe(false);
    expect(decodeSelectionDomainLabels({ slot: ['10:00'] }).ok).toBe(false);
  });

  it('LB-4 [U] treats an absent column as a defect, never as an empty label map', () => {
    // `selectionDomainLabelsJson` is nullable. R3.9.2 (C11:4889-4895) lets Gate 9 interpolate only
    // server-resolved labels, so "absent" must reach the caller as absent.
    expect(decodeSelectionDomainLabels(null).ok).toBe(false);
    expect(decodeSelectionDomainLabels(undefined).ok).toBe(false);
    expect(decodeSelectionDomainLabels('{}').ok).toBe(false);
  });

  it('LB-5 [U] an empty per-field map is not a flat map, and decodes', () => {
    const result = decodeSelectionDomainLabels({ slot: {} });
    expect(result.ok).toBe(true);
    expect(result.ok && [...(result.value.get('slot') ?? [])]).toEqual([]);
  });
});
