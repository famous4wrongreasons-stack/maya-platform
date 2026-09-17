// K5 — H7 browser parity driver page (SHELL-PLAN v2.1 §2.7 step 10b; D11, V2-2). DEV ONLY.
//
// Runs the EMITTED integrity/h7.js in the browser over dev/fixtures/envelopes/** and compares every
// recomputed body_hash with the en_US reference the generator minted with the backend canonicaliser.
// Every result row carries the collator locale it was computed in, so a run whose locale override
// did not apply cannot be read as a run in the requested locale.
//
// P1 rule reported per run (§2.7 10b, §3.2 R7-E6): invariant fixtures must equal the reference in
// every locale; divergent fixtures must equal it under en-US and are recorded, not judged, elsewhere.

const params = new URLSearchParams(window.location.search);
const status = document.getElementById('h7-status');
const output = document.getElementById('h7-result');

const MODULE_PATH = /^\/m\/[0-9a-f]{16}\/src\/integrity\/h7\.js$/;
const FIXTURE_BASE = /^\/__dev\/fixtures\/envelopes\/$/;

const locale = () => new Intl.Collator().resolvedOptions().locale;
const probe = () => ['y', 'j', 'z', 't', 'a', 'Z'].sort((a, b) => a.localeCompare(b)).join('');

/**
 * The emitted module: `?module=` when given; else dev/serve.mjs's `/__dev/web.json` descriptor (the
 * served m/<digest16>/ directory, with no 404 probe); else the module path written into /index.html.
 */
async function modulePath() {
  const explicit = params.get('module');
  if (explicit !== null) {
    if (!MODULE_PATH.test(explicit)) throw new Error('module must be /m/<digest16>/src/integrity/h7.js');
    return explicit;
  }
  const web = await fetch('/__dev/web.json', { cache: 'no-store', credentials: 'omit' });
  if (web.ok) {
    const descriptor = await web.json();
    const candidate = typeof descriptor.modulePath === 'string' ? `/${descriptor.modulePath}src/integrity/h7.js` : '';
    if (MODULE_PATH.test(candidate) && Array.isArray(descriptor.files) && descriptor.files.includes('src/integrity/h7.js')) return candidate;
  }
  const html = await (await fetch('/index.html', { cache: 'no-store', credentials: 'omit' })).text();
  const m = /\bm\/([0-9a-f]{16})\//.exec(html);
  if (m === null) throw new Error('no emitted m/<digest16>/src/integrity/h7.js found; pass ?module=');
  return `/m/${m[1]}/src/integrity/h7.js`;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function finish(result, state) {
  window.__H7_PARITY__ = result;
  output.textContent = JSON.stringify(result);
  status.textContent = state === 'done' ? `done in ${result.locale}` : `error: ${result.error}`;
  document.documentElement.dataset.h7 = state;
}

async function run() {
  const base = params.get('fixtures') ?? '/__dev/fixtures/envelopes/';
  if (!FIXTURE_BASE.test(base)) throw new Error('fixtures must be /__dev/fixtures/envelopes/');
  const path = await modulePath();
  const h7 = await import(path);
  const index = await getJson(`${base}index.json`);
  const here = locale();
  const results = [];
  for (const f of index.fixtures) {
    const env = await getJson(`${base}${f.file}`);
    let got;
    try {
      got = h7.bodyHash(env);
    } catch (e) {
      got = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    const verdict = h7.verify(env, index.now);
    results.push({
      id: f.id,
      group: f.group,
      locale: here,
      reference: f.reference.body_hash,
      got,
      equal: got === f.reference.body_hash,
      verdict,
      expected_verdict: f.expect.verdict,
      verdict_ok: verdict === f.expect.verdict,
    });
  }
  const group = (g) => {
    const rows = results.filter((r) => r.group === g);
    return { total: rows.length, equal: rows.filter((r) => r.equal).length, verdicts_ok: rows.filter((r) => r.verdict_ok).length };
  };
  const invariant = group('invariant');
  const divergent = group('divergent');
  const invariantPass = invariant.equal === invariant.total && invariant.verdicts_ok === invariant.total;
  const divergentPass = divergent.equal === divergent.total && divergent.verdicts_ok === divergent.total;
  return {
    page: 'h7-parity',
    locale: here,
    probe: probe(),
    module: path,
    now: index.now,
    reference_lang: index.reference_lang,
    results,
    summary: {
      total: results.length,
      invariant,
      divergent,
      // P1 pass/fail: the invariant corpus everywhere; the full corpus under en-US only.
      p1_pass: here === 'en-US' ? invariantPass && divergentPass : invariantPass,
      // Recorded, not judged, outside en-US: R7-E6 evidence.
      divergent_differs: results.filter((r) => r.group === 'divergent' && !r.equal).map((r) => r.id),
    },
  };
}

run().then(
  (result) => finish(result, 'done'),
  (e) => finish({ page: 'h7-parity', locale: locale(), probe: probe(), error: e instanceof Error ? e.message : String(e) }, 'error'),
);
