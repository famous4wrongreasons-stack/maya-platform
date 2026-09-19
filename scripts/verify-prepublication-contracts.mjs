import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
const native = args.includes("--native");
const file =
  args.find((argument) => argument !== "--native") ??
  "сайт и приложение/app.html";
const source = readFileSync(file, "utf8");

function requireText(text, description) {
  if (!source.includes(text)) {
    throw new Error(`${file}: missing ${description}`);
  }
}

function requireOrder(start, guard, request, description) {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`${file}: missing ${description} function`);
  const guardAt = source.indexOf(guard, from);
  const requestAt = source.indexOf(request, from);
  if (guardAt < 0 || requestAt < 0 || guardAt > requestAt) {
    throw new Error(`${file}: ${description} is not fail-closed before legacy request`);
  }
}

if (native) {
  requireText(
    "var trustedBoot = !!(srvBoot",
    "trusted native MAYA OS boot",
  );
  requireText(
    "window.__ME_MAYA_OS_PREVIEW === true && isNativeApp()",
    "native-only owner preview",
  );
  requireText(
    "Обычный запуск нативного клиента всегда возвращается в legacy production.",
    "legacy-safe normal native launch",
  );
} else {
  requireText("apiBase = location.origin + '/api'", "same-origin public API boot");
}
requireText("CHAT_HISTORY_CACHE + ':saas:' + ctx.ns", "tenant-scoped chat cache");
// Build 9 persists across restarts. Isolation is the tenant/User/surface key,
// not the obsolete choice of sessionStorage. Execute the actual key/storage
// functions so dropping any dimension fails this release gate.
const cacheStart = source.indexOf("  function chatHistoryCacheKey()");
const cacheEnd = source.indexOf("  function migrateSaasChatCacheFromSession()", cacheStart);
assert(cacheStart >= 0 && cacheEnd > cacheStart, "chat cache functions missing");
const local = new Map();
const session = new Map();
const keys = new Set();
for (const tenant of ["tenant-a", "tenant-b"]) {
  for (const user of ["user-a", "user-b"]) {
    for (const surface of ["client", "staff", "owner"]) {
      const result = runInNewContext(
        `${source.slice(cacheStart, cacheEnd)}; ({key: chatHistoryCacheKey(), storage: chatHistoryStorage()})`,
        { window: { __ME_SAAS_CTX: { ns: tenant } },
          saasChatBundle: () => ({ token: "synthetic", user: { id: user } }),
          chatSurface: () => surface, CHAT_HISTORY_CACHE: "maya_chat_history_v1",
          localStorage: local, sessionStorage: session },
      );
      assert.equal(result.key, `maya_chat_history_v1:saas:${tenant}:${user}:${surface}`);
      assert([local, session].includes(result.storage), "unknown chat storage");
      assert(!keys.has(result.key), "cross-principal chat cache collision");
      keys.add(result.key);
    }
  }
}
requireText("window.__SAAS_FEATURES_EFFECTIVE === true", "authenticated feature gate");
// Rendering chat while entitlements load is not authorization. A known denial
// or planned capability must still redirect; the server owns every AI request.
const gateStart = source.indexOf("      if (s === 'chat' && !onbGo && window.__ME_SAAS_CTX && _chatBundle");
const gateEnd = source.indexOf("      if (s === 'chat' && !onbGo && !(window.__meHasSession", gateStart);
assert(gateStart >= 0 && gateEnd > gateStart, "AI entitlement presentation gate missing");
for (const [entitlements, ready, expected] of [[[], true, "home"], [["ai.owner"], false, "home"], [["ai.owner"], true, "chat"]]) {
  assert.equal(runInNewContext(`${source.slice(gateStart, gateEnd)}; s`, {
    s: "chat", onbGo: false, _chatBundle: { token: "synthetic" },
    window: { __ME_SAAS_CTX: {}, __SAAS_FEATURES_EFFECTIVE: true,
      __SAAS_FEATURES: entitlements, __meFeatureReady: () => ready },
  }), expected);
}
requireText("x.amount_kopecks", "backend kopeck amount support");
requireText("x.delta != null ? x.delta : x.amount", "backend loyalty delta support");
requireText("/ai/approvals?surface=", "pending approval recovery");
// SaaS voice is supported now; the executable owner-routing proof below replaces
// the old requirement that every tenant must hide its microphone.
requireText("localBookingFetch('/customer-portal'", "resilient customer portal integration");
requireText("window.addEventListener('me-saas-data-changed'", "post-approval data refresh");
assert(/var roleQuicks = defaultQuickReplies\(\)\.slice\(0, [34]\)/.test(source), "bounded role-aware welcome commands");
requireText('featureKeys: ["ai.owner", "ai.admin", "ai.consultant"]', "role-aware AI navigation entitlements");
requireText("if (!meTabFeatureAllowed(it)) return false", "shared navigation feature gate");
requireText("var AI_SUMMARY_RU", "localized approval summaries");

requireOrder(
  "syncChatHistoryRef.current = async function",
  "if (window.__ME_SAAS_CTX) return",
  "?action=chat_history",
  "SaaS history sync",
);
// B23 retired server deletion altogether. Requiring the old endpoint here
// would require reintroducing a forbidden path.
requireText("p5_b23_server_history_delete_retired", "B23 server-delete retirement");
assert(!/action=chat_delete\b|\/api\/chat\/delete/.test(source), "retired server deletion returned");

function functionSource(marker) {
  const start = source.indexOf(marker);
  assert(start >= 0, `missing ${marker}`);
  for (let end = source.indexOf("}", start); end >= 0; end = source.indexOf("}", end + 1)) {
    const candidate = source.slice(start, end + 1);
    try { new Script(`(${candidate})`); return candidate; } catch {}
  }
  throw new Error(`unterminated ${marker}`);
}
// Supported SaaS voice uses the authenticated transcription owner and sends the
// resulting text via the canonical chat path; it cannot reach the legacy proxy.
const calls = [];
const audio = runInNewContext(`(${functionSource("async function sendAudio(")})`, {
  onbOnRef: { current: false }, window: { __ME_SAAS_CTX: {} }, sending: false,
  setSending() {}, setMsgs() {},
  saasAiFetch: async (path) => { calls.push(path); return { transcript: "synthetic" }; },
  send: async (text) => calls.push(text),
  fetch() { throw new Error("SaaS audio reached legacy fetch"); },
});
await audio("data:audio/wav;base64,AAAA");
assert.deepEqual(calls, ["/ai/transcribe", "synthetic"]);

for (const secretMarker of [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
]) {
  if (source.includes(secretMarker)) {
    throw new Error(`${file}: provider secret marker leaked into frontend: ${secretMarker}`);
  }
}

process.stdout.write(`${file}: prepublication safety contracts OK\n`);
