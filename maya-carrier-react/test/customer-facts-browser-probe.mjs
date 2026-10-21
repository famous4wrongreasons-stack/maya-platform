// Real current React bundle, UI debug login and HTTP; no response/authority mocks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Browser } from "../../maya-chat-shell/test/cdp-verify.mjs";
import { createDevServer } from "../../maya-chat-shell/dev/serve.mjs";
import { installGuard, localOrigin } from "./client-dossier-browser-guard.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(read, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const x = await read();
    if (x) return x;
    await pause(50);
  }
  throw new Error("D3 browser timeout: " + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Missing IPC " + type)),
      15000,
    );
    const f = (m) => {
      if (m?.type === type) {
        clearTimeout(timer);
        process.off("message", f);
        resolve(m);
      }
    };
    process.on("message", f);
  });
}
assert(process.connected);
assert.equal(process.env.JEST_D3_OUTER_NETWORK_FENCE, "loopback");
const start = receive("start");
process.send({ type: "ready" });
const input = await start;
const report = {
  contract: "maya.customer-facts-current-react/1",
  status: "running",
  screens: [],
  realHttp: true,
  realUiLogin: true,
  scriptedModelSelection: true,
  admission: "NOT_ISSUED",
};
let dev, browser, child, profile, page, guard;
let chromeErrors = "";
let closing;
const cleanup = () =>
  (closing ??= (async () => {
    await browser?.close();
    if (child && child.exitCode === null) child.kill("SIGKILL");
    await dev?.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  })());
process.once("disconnect", () => {
  void cleanup().then(() => process.exit(2));
});
try {
  dev = createDevServer({
    root: path.join(root, "dist/web"),
    api: localOrigin(input.backendOrigin) + "/api",
    upstreamPorts: [new URL(input.backendOrigin).port],
  });
  const { port } = await dev.listen(0),
    origin = localOrigin("http://127.0.0.1:" + port);
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "maya-d3-chrome-"));
  child = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      // Chrome cannot nest its macOS sandbox inside the driver OS sandbox.
      // The outer sandbox still denies all non-loopback networking for descendants.
      "--no-sandbox",
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--metrics-recording-only",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--proxy-server=http://127.0.0.1:9",
      "--proxy-bypass-list=127.0.0.1",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      "--disable-quic",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (b) => (chromeErrors += String(b)));
  const ready = path.join(profile, "DevToolsActivePort");
  await until(() => {
    assert(
      child.exitCode === null && child.signalCode === null,
      "Owned Chrome exited before readiness",
    );
    return fs.existsSync(ready);
  }, "Chrome");
  const [cdp, ws] = fs.readFileSync(ready, "utf8").trim().split("\n");
  browser = new Browser(child, profile, `ws://127.0.0.1:${cdp}${ws}`);
  await Promise.race([
    browser.connect(),
    pause(8000).then(() => {
      throw new Error("Owned CDP connection deadline");
    }),
  ]);
  page = await browser.newPage();
  guard = await installGuard(page, origin, {
    emails: [input.email],
    prompts: [input.prompt],
  });
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 932,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.goto(origin + "/");
  async function click(name) {
    await page.eval('Q.all("button").filter(Q.visible).map(Q.name)');
    assert.equal(
      await page.click(
        `Q.all('button').find(el=>Q.visible(el)&&Q.name(el)===${JSON.stringify(name)})`,
      ),
      true,
    );
  }
  assert(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
  await click("Войти по email");
  assert(await page.waitFor("!!Q.email()"));
  await page.fill("Q.email()", input.email);
  await click("Получить код");
  const login = await until(
    () => page.apiRequests("/auth/email/start").find((r) => r.finishedAt),
    "debug email login",
  );
  assert([200, 201].includes(login.status));
  const body = JSON.parse(await page.responseBody(login.requestId));
  assert.equal(body.delivery, "debug");
  assert.match(body.debug_code, /^\d{4,8}$/);
  assert(await page.waitFor("!!Q.code()"));
  await page.fill("Q.code()", body.debug_code);
  delete body.debug_code;
  await click("Войти");
  assert(await page.waitFor("!!Q.composer()"));
  await until(
    () => page.apiRequests("/ai/conversation").some((r) => r.finishedAt),
    "authenticated history restoration",
  );
  for (const state of ["configured", "expired"]) {
    const before = page.apiRequests("/ai/chat").length;
    await page.fill("Q.composer()", input.prompt);
    assert(
      await page.waitFor(
        "Q.all('button').some(el=>Q.visible(el)&&Q.name(el)==='Отправить'&&!el.disabled)",
      ),
      "Composer must be ready after authenticated history restoration",
    );
    await click("Отправить");
    const response = await until(
      () =>
        page
          .apiRequests("/ai/chat")
          .slice(before)
          .find((r) => r.finishedAt),
      "ordinary " + state + " chat",
    );
    assert.equal(response.status, 201);
    const answer = JSON.parse(await page.responseBody(response.requestId));
    assert.equal(answer.action, null);
    assert.equal(answer.resolution, undefined);
    assert.equal(answer.coordination.state, "COMPLETED");
    if (state === "configured") {
      assert(answer.reply.includes(input.fact));
      assert.equal(answer.grounding.status, "verified");
    } else {
      assert(answer.reply.includes("пока не подтверждены"));
      assert(!answer.reply.includes(input.fact));
      assert.equal(answer.grounding.status, "blocked");
    }
    const expected = answer.reply.replace(/\s+/g, " ").trim();
    assert(
      await page.waitFor(
        `Q.all('[data-chat-message="maya"]').at(-1)?.textContent.replace(/^MAYA: /,'').replace(/\\s+/g,' ').trim()===${JSON.stringify(expected)}`,
      ),
    );
    assert.equal(
      await page.eval('document.querySelectorAll("article.widget").length'),
      0,
    );
    assert(
      await page.waitFor('!document.querySelector(".maya-typewriter-caret")'),
    );
    await page.eval(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const shot = await page.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(input.output, "react-" + state + ".png"),
      Buffer.from(shot.data, "base64"),
      { mode: 0o600, flag: "wx" },
    );
    report.screens.push({
      state,
      reply: answer.reply,
      grounding: answer.grounding.status,
      rawJsonWidget: false,
    });
    if (state === "configured") {
      const ack = receive("expired");
      process.send({ type: "expire" });
      await ack;
    }
  }
  assert.deepEqual(guard.blocked, []);
  assert.deepEqual(guard.errors, []);
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.failure = String(error.stack ?? error.message);
  report.guard = guard
    ? { blocked: guard.blocked, errors: guard.errors }
    : null;
  report.chatRequests =
    page
      ?.apiRequests("/ai/chat")
      .map((r) => ({ status: r.status, finished: !!r.finishedAt })) ?? [];
  fs.writeFileSync(
    path.join(input.output, "owned-chrome-stderr.log"),
    chromeErrors,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
  fs.writeFileSync(
    path.join(input.output, "react-browser.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (report.status !== "PASS") console.error(report.failure);

// The IPC channel must not retain a completed proof child.
process.exit(process.exitCode ?? 0);
