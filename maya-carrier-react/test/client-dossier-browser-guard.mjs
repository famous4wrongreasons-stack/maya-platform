import assert from "node:assert/strict";

export const PROMPTS = Object.freeze({
  ambiguous: "Досье клиента Иван",
  unique: "Досье клиента Иван Петров",
  none: "Досье клиента Зиновий",
  unavailable: "Досье клиента Семён",
  revoked: "Досье клиента Иван",
});
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 8192) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const keys = (value, required, optional = []) =>
  object(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => [...required, ...optional].includes(key));
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export function localOrigin(raw) {
  const url = new URL(raw);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.ok(url.port && !["5432", "55611"].includes(url.port));
  assert.equal(url.username + url.password + url.search + url.hash, "");
  assert.equal(url.pathname, "/");
  return url.origin;
}

// This bounds the owned acceptance only. Every request still reaches the real
// backend; no response, authority, credential or session is fabricated here.
export function admitted(request, origin, scope) {
  try {
    const url = new URL(request.url);
    if (
      url.origin !== localOrigin(origin) ||
      url.username ||
      url.password ||
      url.hash
    )
      return false;
    if (request.method === "GET") {
      if (url.search) return false;
      return /^\/(?:api\/ai\/conversation|index\.html|styles\.css|manifest\.webmanifest|favicon\.ico|icons\/maya-(?:192|512|512-maskable|apple-180)\.png|m\/[A-Za-z0-9]+\/main\.js)?$/.test(
        url.pathname,
      );
    }
    if (request.method !== "POST" || url.search) return false;
    const body = JSON.parse(request.postData);
    if (url.pathname === "/api/auth/email/start")
      return keys(body, ["email"]) && scope.emails.includes(body.email);
    if (url.pathname === "/api/auth/email/verify")
      return (
        keys(body, ["email", "code"]) &&
        scope.emails.includes(body.email) &&
        /^\d{4,8}$/.test(body.code)
      );
    if (url.pathname === "/api/auth/refresh")
      return keys(body, ["refreshToken"]) && text(body.refreshToken);
    if (url.pathname === "/api/widgets/resolve") {
      if (!keys(body, ["thread_page"])) return false;
      const page = body.thread_page;
      if (
        !keys(page, ["limit"], ["before"]) ||
        !Number.isInteger(page.limit) ||
        page.limit < 1 ||
        page.limit > 50 ||
        (page.before !== undefined && !uuid(page.before))
      )
        return false;
      return true;
    }
    if (
      url.pathname !== "/api/ai/chat" ||
      !keys(body, ["surface", "requestId", "messages"], ["conversationId"]) ||
      body.surface !== "web" ||
      !uuid(body.requestId) ||
      (body.conversationId !== undefined && !uuid(body.conversationId))
    )
      return false;
    return (
      Array.isArray(body.messages) &&
      body.messages.length > 0 &&
      body.messages.length <= 40 &&
      body.messages.every(
        (message) =>
          keys(message, ["role", "content"]) &&
          ["user", "assistant"].includes(message.role) &&
          text(message.content, 4000) &&
          (message.role !== "user" || scope.prompts.includes(message.content)),
      ) &&
      body.messages.at(-1).role === "user"
    );
  } catch {
    return false;
  }
}

export async function installGuard(page, origin, scope) {
  localOrigin(origin);
  assert.ok(scope.emails.length > 0 && scope.prompts.length > 0);
  const blocked = [],
    errors = [];
  const listener = (event) => {
    if (
      event.sessionId !== page.sessionId ||
      event.method !== "Fetch.requestPaused"
    )
      return;
    const { requestId, request } = event.params;
    const allow = admitted(request, origin, scope);
    // Evidence never retains email, OTP, credentials, tokens or request/query data.
    if (!allow)
      blocked.push({
        method: request.method,
        path: new URL(request.url).pathname,
      });
    void page
      .send(allow ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId,
        ...(allow ? {} : { errorReason: "BlockedByClient" }),
      })
      .catch(() => errors.push("request_interception_failed"));
  };
  page.browser.listeners.add(listener);
  await page.send("Network.setBypassServiceWorker", { bypass: true });
  await page.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
  await page.send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  return { blocked, errors };
}
