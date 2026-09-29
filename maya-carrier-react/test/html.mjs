// A minimal HTML reader for renderToStaticMarkup output.
//
// The carrier ships nine packages on purpose, so no parser is added for a test. The input is not
// arbitrary HTML: it is React's own serialisation of a tree this repository wrote, which is
// well-formed, quotes every attribute and self-closes every void element. That is a small enough
// language to read exactly.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const decode = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const attrsOf = (raw) => {
  const out = {};
  for (const m of raw.matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
    if (!m[1]) continue;
    out[m[1].toLowerCase()] = m[2] === undefined ? '' : decode(m[2]);
  }
  return out;
};

/** Parse into a tree of {tag, attrs, children} and text strings. */
export function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|[^>])*?)(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) {
      top.children.push(decode(m[4]));
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith('</')) {
      for (let i = stack.length - 1; i > 0; i -= 1)
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      continue;
    }
    const node = { tag, attrs: attrsOf(m[2] ?? ''), children: [] };
    top.children.push(node);
    if (!VOID.has(tag) && m[3] !== '/') stack.push(node);
  }
  return root;
}

export function walk(node, visit) {
  if (typeof node === 'string') return;
  if (node.tag !== '#root') visit(node);
  for (const child of node.children) walk(child, visit);
}

export const findAll = (root, test) => {
  const out = [];
  walk(root, (el) => {
    if (test(el)) out.push(el);
  });
  return out;
};

export const textOf = (node) => {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
};
