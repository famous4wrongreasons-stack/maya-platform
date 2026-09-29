// Precompute the sealed RenderResults for the gallery, through the canonical offline pipeline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, '..', '..', 'maya-chat-shell', 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const { resultOf } = await import(pathToFileURL(path.join(HERE, '..', 'test', '.bundle.mjs')).href);

const items = INDEX.fixtures.map((f) => {
  const envelope = JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8'));
  return {
    id: 'w-' + f.id,
    fixture: f.id,
    kind: f.kind,
    note: f.note ?? '',
    result: resultOf(envelope, INDEX.now),
    display: 'live',
    pending: null,
    sentence: null,
  };
});
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(items));
console.log(`results: ${items.length} cards`);
