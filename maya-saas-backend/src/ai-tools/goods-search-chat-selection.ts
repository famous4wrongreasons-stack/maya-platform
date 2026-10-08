/** Explicit code in this user turn only, after selection of the search tool.
 * Phone-shaped barcodes stay masked for the model. This is a search preference,
 * never item identity or mutation authority. Quoting preserves article periods. */
export function explicitGoodsSearchCode(
  text: string,
): string | null | undefined {
  const markers = [
    ...text.matchAll(/(?:штрихкод[а-яё]*|артикул[а-яё]*|barcode)/giu),
  ];
  if (!markers.length) return undefined;
  if (markers.length !== 1) return null;
  const marker = markers[0];
  const tail = text
    .slice(marker.index + marker[0].length)
    .trim()
    .replace(/^[:№=]\s*/u, '');
  const suffix = '(?:\\s+в\\s+YCLIENTS)?[.!?]?\\s*$';
  if (!/^артикул/iu.test(marker[0])) {
    const match = new RegExp(
      '^(?:[«"]([0-9]{2,100})[»"]|([0-9]{2,100}))' + suffix,
      'iu',
    ).exec(tail);
    return match ? (match[1] ?? match[2]) : null;
  }
  const quoted = new RegExp(
    '^[«"]([\\p{L}\\d][\\p{L}\\d_./-]{1,99})[»"]' + suffix,
    'iu',
  ).exec(tail);
  if (quoted) return quoted[1];
  const bare = new RegExp(
    '^([\\p{L}\\d][\\p{L}\\d_./-]{0,98}[\\p{L}\\d_/-])' + suffix,
    'iu',
  ).exec(tail);
  return bare?.[1] ?? null;
}
