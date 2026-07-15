import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "сайт и приложение/app.html";
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

requireText("apiBase = location.origin + '/api'", "same-origin public API boot");
requireText("CHAT_HISTORY_CACHE + ':saas:' + ctx.ns", "tenant-scoped chat cache");
requireText("return window.__ME_SAAS_CTX ? sessionStorage : localStorage", "isolated SaaS chat storage");
requireText("window.__SAAS_FEATURES_EFFECTIVE === true", "authenticated feature gate");
requireText("_aiOk = false; // readiness", "fail-closed AI entitlement gate");
requireText("x.amount_kopecks", "backend kopeck amount support");
requireText("x.delta != null ? x.delta : x.amount", "backend loyalty delta support");
requireText("/ai/approvals?surface=", "pending approval recovery");
requireText("var micBtn = universal ? null", "tenant-safe voice UI gate");
requireText("localBookingFetch('/customer-portal'", "resilient customer portal integration");
requireText("window.addEventListener('me-saas-data-changed'", "post-approval data refresh");
requireText("var roleQuicks = defaultQuickReplies().slice(0, 3)", "role-aware chat welcome commands");
requireText('featureKeys: ["ai.owner", "ai.admin", "ai.consultant"]', "role-aware AI navigation entitlements");
requireText("if (!meTabFeatureAllowed(it)) return false", "shared navigation feature gate");
requireText("var AI_SUMMARY_RU", "localized approval summaries");

requireOrder(
  "syncChatHistoryRef.current = async function",
  "if (window.__ME_SAAS_CTX) return",
  "?action=chat_history",
  "SaaS history sync",
);
requireOrder(
  "async function deleteChatMessage",
  "if (window.__ME_SAAS_CTX) return",
  "?action=chat_delete",
  "SaaS message deletion",
);
requireOrder(
  "async function sendAudio",
  "if (window.__ME_SAAS_CTX) return",
  "?action=chat",
  "SaaS audio send",
);

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
