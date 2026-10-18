import fs from 'node:fs';

// Chrome creates this file before writing its endpoint. Existence alone is not
// readiness. Poll a complete endpoint within the caller's unchanged deadline.
export function readChromeReadyFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const lines = text.trim().split('\n');
  if (lines.length !== 2) return null;
  const [port, wsPath] = lines;
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  if (!/^\/devtools\/browser\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(wsPath)) return null;
  return [port, wsPath];
}
