const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend';
require(path.join(root, 'node_modules/ts-node/register/transpile-only'));
const {WIDGETS_LIVE_TEST_LITERALS} = require(path.join(root,'test/widgets-live/support/environment'));
const raw = process.env.MAYA_GATE_DATABASE_URL || 'postgresql://maya_gate@127.0.0.1:57463/maya_widget_gate_proof_unified';
const url = new URL(raw);
if(url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '57463' || url.username !== 'maya_gate' || url.password || url.search || url.hash || !['/maya_widget_gate_proof_unified','/maya_events_proof_unified','/maya_gates_smoke_unified'].includes(url.pathname)) throw new Error('Owned proof URL required');
const env = {PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
 NODE_OPTIONS:process.env.MAYA_GATE_LARGE_HEAP === '1' ? '--max-old-space-size=6144' : '--max-old-space-size=3072', ...WIDGETS_LIVE_TEST_LITERALS, DATABASE_URL:url.href, HTTP_SMOKE_PORT:'57464'};
if(url.pathname.startsWith('/maya_widget_gate_proof_')) env.WIDGET_GATEWAY_PG='required';
for(const key of ['JEST_COMBINED_BROWSER_OUTPUT','WIDGETS_EVIDENCE','WIDGETS_EVIDENCE_DIR']) if(process.env[key]) env[key]=process.env[key];
const args=process.argv.slice(2);const child=spawnSync(args[0],args.slice(1),{cwd:process.cwd(),env,stdio:'inherit'});
if(child.error) throw child.error;
if(child.signal) process.stderr.write('GATE_CHILD_SIGNAL ' + child.signal + '\n');
process.exit(child.status ?? 1);
