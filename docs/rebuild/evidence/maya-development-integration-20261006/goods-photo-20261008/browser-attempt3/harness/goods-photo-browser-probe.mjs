// Explicit opt-in child of the owned HTTP/PG probe. Uses the production React
// web bundle and real HTTP only; no page routes, response fixtures or token seed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Browser } from "/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-chat-shell/test/cdp-verify.mjs";
import { createDevServer } from "/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-chat-shell/dev/serve.mjs";
import {
  installGuard,
  localOrigin,
} from "./goods-photo-browser-guard.mjs";

const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-carrier-react';
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await pause(50);
  }
  throw new Error("Timed out: " + label);
}
function receive(type) {
  return new Promise((resolve, reject) => {
    const listener = (value) => {
      if (value?.type !== type) return;
      clearTimeout(timer);
      process.off("message", listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      process.off("message", listener);
      reject(new Error("Missing parent checkpoint: " + type));
    }, 15_000);
    process.on("message", listener);
  });
}
async function checkpoint(name, data = {}) {
  const ack = receive("continue:" + name);
  process.send({ type: "checkpoint", name, ...data });
  await ack;
}
async function snapshot(page) {
  return page.eval(
    '({ text: document.body.innerText, controls: Q.all("button,input,textarea").filter(Q.visible).map(el => ({tag:el.tagName,name:Q.name(el)})) })',
  );
}
async function clickNamed(page, name) {
  // Read current rendered controls before selecting and clicking one of them.
  assert.ok(await page.waitFor(`!!Q.all('button').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)})`),'Visible control must settle');
  const view = await snapshot(page);
  assert.ok(
    view.controls.some(
      (control) => control.tag === "BUTTON" && control.name === name,
    ),
    "Visible control missing: " + name,
  );
  assert.equal(await page.focus(`(Q.all('dialog[open] button').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)}) ?? Q.all('button').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)}))`),true);
  await page.press('Enter');
}
async function login(page, email) {
  assert.ok(await page.waitFor('!!Q.byName("button", /^Войти по email$/)'));
  await clickNamed(page, "Войти по email");
  assert.ok(await page.waitFor("!!Q.email()"));
  await snapshot(page);
  assert.equal(await page.fill("Q.email()", email), true);
  const before = page.apiRequests("/auth/email/start").length;
  await clickNamed(page, "Получить код");
  const start = await until(
    () =>
      page
        .apiRequests("/auth/email/start")
        .slice(before)
        .find((r) => r.finishedAt),
    "actual debug email start",
  );
  assert.ok([200, 201].includes(start.status));
  const response = JSON.parse(await page.responseBody(start.requestId));
  assert.equal(response.delivery, "debug");
  assert.match(response.debug_code, /^\d{4,8}$/);
  assert.ok(await page.waitFor("!!Q.code()"));
  await snapshot(page);
  assert.equal(await page.fill("Q.code()", response.debug_code), true);
  await clickNamed(page, "Войти");
  assert.ok(
    await page.waitFor("!!Q.composer()"),
    "Real UI sign-in must complete",
  );
  // Do not publish auth bodies, code, email, tokens, console or request postData.
  delete response.debug_code;
  assert.equal(
    response.retry_after_seconds,
    60,
    "Existing local profile cooldown changed; review acceptance timing",
  );
  await until(
    () => page.apiRequests("/ai/conversation").some((r) => r.finishedAt),
    "HTTP history",
  );
  return Date.now() + (response.retry_after_seconds + 1) * 1000;
}
const FIELDS = {
  store: 'Номер склада в YCLIENTS', quantity: 'Количество прихода',
  cost: 'Закупочная цена за выбранную единицу', currency: 'Валюта закупочной цены',
  received: 'Дата и время прихода с часовым поясом', query: 'Название, артикул или штрихкод',
};
const QUERY = name => `Q.all('input').find(el => Q.visible(el) && !el.disabled && Q.name(el) === ${JSON.stringify(name)})`;
async function fill(page,name,value) { await snapshot(page); assert.equal(await page.fill(QUERY(name),value),true); }
async function upload(page,file) {
  const {root} = await page.send('DOM.getDocument');
  const {nodeId} = await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type="file"]'});
  assert.ok(nodeId); await page.send('DOM.setFileInputFiles',{nodeId,files:[file]});
}
async function response(page,route,before) {
  const call=await until(()=>page.apiRequests(route).slice(before).find(r=>r.finishedAt),'actual '+route);
  assert.equal(call.status,201);
  return {call,body:JSON.parse(await page.responseBody(call.requestId)),input:JSON.parse(await page.postData(call))};
}
async function fieldsBlank(page) {
  for(const name of [FIELDS.store,FIELDS.quantity,FIELDS.cost,FIELDS.currency,FIELDS.received]) {
    assert.ok(await page.waitFor('!!('+QUERY(name)+')'));
    assert.equal(await page.eval('('+QUERY(name)+').value'),'','Receipt facts must be explicit');
  }
  assert.equal(await page.eval(`Q.all('button').filter(el=>Q.visible(el) && (Q.name(el).includes('единица №') || Q.name(el)==='Проверено: это закупочная цена за единицу')).some(el=>el.getAttribute('aria-pressed')==='true')`),false);
}
async function manualFields(page,cost='10.25') {
  await fill(page,FIELDS.store,'9'); await fill(page,FIELDS.quantity,'2.5');
  await clickNamed(page,'флакон · единица №11'); await fill(page,FIELDS.cost,cost);
  await fill(page,FIELDS.currency,'RUB'); await fill(page,FIELDS.received,'2026-10-08T09:00:00Z');
  await clickNamed(page,'Проверено: это закупочная цена за единицу');
}
async function decide(page,label,state) {
  const before=page.apiRequests('/widgets/intent').length;
  const view=await snapshot(page), button=view.controls.filter(c=>c.tag==='BUTTON' && c.name.startsWith(label)).at(-1);
  assert.ok(button,'Canonical decision control is visible'); await clickNamed(page,button.name);
  const call=await until(()=>page.apiRequests('/widgets/intent').slice(before).find(r=>r.finishedAt),'canonical decision');
  assert.equal(call.status,200); const body=JSON.parse(await page.responseBody(call.requestId));
  assert.equal(body.owner_decision?.state,state); assert.equal(typeof body.owner_decision.receipt_text,'string');
  assert.equal(page.apiRequests('/widgets/intent').length,before+1);
  assert.ok(await page.waitFor('document.body.innerText.includes('+JSON.stringify(state==='SUCCEEDED'?'Приход товара подтверждён в YCLIENTS.':'Приход отклонён. Изменений в складе нет.')+')'));
  const close=await page.eval(`Q.all('dialog[open] button').filter(Q.visible).map(Q.name).find(name=>/Закрыть|Назад/.test(name)) ?? null`);
  if(close) await clickNamed(page,close);
  return body.owner_decision.receipt_text;
}

async function main() {
  assert.equal(
    process.connected,
    true,
    "Use goods-photo.probe-spec.ts with a fresh owned proof directory",
  );
  const pendingInput = receive("start");
  process.send({ type: "ready" });
  const input = await pendingInput;
  const backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, "output", "playwright");
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = {
    contract: "maya.goods-photo-browser/1",
    status: "running",
    syntheticNativeProviderTransport: true,
    modelCalls: 0,
    syntheticExtraction: true,
    syntheticReceiptContextAndDispatch: true,
    recognitionAcceptance: false,
    realModelAcceptance: false,
    externalProviderAcceptance: false,
    snapshots: {},
    observations: {},
  };
  let browser, dev, chromeChild, chromeProfile;
  const pages = [],
    guards = [];
  let closing;
  const cleanup = () =>
    (closing ??= (async () => {
      try {
        await browser?.close();
      } finally {
        // Own the child from spawn, including the interval before CDP is ready.
        if (chromeChild && chromeChild.exitCode === null) {
          const stopped = new Promise((resolve) =>
            chromeChild.once("exit", resolve),
          );
          chromeChild.kill("SIGKILL");
          await Promise.race([stopped, pause(2000)]);
        }
        if (chromeProfile)
          fs.rmSync(chromeProfile, { recursive: true, force: true });
        await dev?.close();
      }
    })());
  const terminate = () => {
    void cleanup().finally(() => process.exit(2));
  };
  process.once("SIGTERM", terminate);
  process.once("disconnect", terminate);
  async function capture(page, name) {
    // textContent includes the accessibility copy before the visible typewriter
    // finishes. Wait for actual reveal, then frame the latest text for pixels.
    assert.ok(
      await page.waitFor('!document.querySelector(".maya-typewriter-caret")'),
    );
    await page.eval(
      'Q.all(\'[data-chat-message="maya"]\').at(-1)?.scrollIntoView({ block: "nearest" })',
    );
    // DOM completion precedes compositor paint; preserve real pixels after two frames.
    await page.eval(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
    );
    report.snapshots[name] = await snapshot(page);
    const { data } = await page.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(output, name + ".png"),
      Buffer.from(data, "base64"),
      { flag: "wx", mode: 0o600 },
    );
  }
  async function newPage(origin) {
    const page = await browser.newPage();
    pages.push(page);
    guards.push(
      await installGuard(page, origin, {
        emails: [input.email],
      }),
    );
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(origin + "/");
    return page;
  }
  try {
    dev = createDevServer({
      root: path.join(root, "dist/web"),
      api: backendOrigin + "/api",
      upstreamPorts: [new URL(backendOrigin).port],
    });
    const { port } = await dev.listen(0);
    const origin = localOrigin(`http://127.0.0.1:${port}`);
    report.carrierOrigin = origin;
    // Fail closed for Chrome background traffic as well as the page Fetch guard.
    // The controller's own CDP socket is separate from browser page requests.
    assert.equal(
      closing,
      undefined,
      "Acceptance cancelled before Chrome startup",
    );
    chromeProfile = fs.mkdtempSync(
      path.join(os.tmpdir(), "maya-goods-photo-chrome-"),
    );
    fs.chmodSync(chromeProfile, 0o700);
    chromeChild = spawn(
      chrome,
      [
        "--headless=new",
        "--js-flags=--max-old-space-size=256",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--metrics-recording-only",
        "--remote-debugging-port=0",
        "--user-data-dir=" + chromeProfile,
        "--proxy-server=http://127.0.0.1:9",
        "--proxy-bypass-list=127.0.0.1",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        "--disable-quic",
        "--disable-features=OptimizationHints,MediaRouter",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    let launchError;
    chromeChild.once("error", (error) => {
      launchError = error;
    });
    const portFile = path.join(chromeProfile, "DevToolsActivePort");
    await until(() => {
      if (launchError) throw launchError;
      assert.equal(
        chromeChild.exitCode,
        null,
        "Owned Chrome exited before CDP readiness",
      );
      return fs.existsSync(portFile);
    }, "owned Chrome startup");
    const [cdpPort, wsPath] = fs
      .readFileSync(portFile, "utf8")
      .trim()
      .split("\n");
    assert.match(cdpPort, /^\d+$/);
    assert.match(wsPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
    browser = new Browser(
      chromeChild,
      chromeProfile,
      `ws://127.0.0.1:${cdpPort}${wsPath}`,
    );
    let connectTimer;
    try {
      await Promise.race([
        browser.connect(),
        new Promise((_, reject) => {
          connectTimer = setTimeout(
            () => reject(new Error("Owned CDP connect timed out")),
            10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(connectTimer);
    }
    report.chrome = await browser.version();
    const page = await newPage(origin);
    const nextLoginAt = await login(page, input.email);
    assert.equal(page.apiRequests('/ai/chat').length,0);
    const count=route=>page.apiRequests(route).length;
    const noPhotoCalls=()=>assert.equal(count('/ai/goods/'),0);
    noPhotoCalls(); await clickNamed(page,'Товар по фото накладной'); noPhotoCalls();
    await checkpoint('opened');
    await upload(page,input.imagePaths.main);
    const first=await until(()=>page.apiRequests('/ai/goods/photo-preview').find(r=>r.finishedAt),'first preview');
    assert.equal(first.status,201); const preview=JSON.parse(await page.responseBody(first.requestId));
    assert.equal(preview.recognition_acceptance,'NOT_ACCEPTED'); assert.equal(preview.lines.length,2);
    assert.ok(await page.waitFor('document.body.innerText.includes("Предварительные строки")'));
    assert.ok((await snapshot(page)).text.includes('Смысл: не определён'));
    assert.equal(count('/ai/goods/search'),0); assert.equal(count('/ai/goods/item-read'),0); assert.equal(count('/ai/goods/receipt-review'),0);
    await capture(page,'provisional'); await checkpoint('uploaded',{preview});
    await clickNamed(page,'Выбрать строку 1'); assert.equal(await page.eval('('+QUERY(FIELDS.query)+').value'),'');
    assert.equal(count('/ai/goods/search'),0); await checkpoint('selected');
    let before=count('/ai/goods/search'); await fill(page,FIELDS.query,'шампунь'); await clickNamed(page,'Найти товар в YCLIENTS');
    let seen=await response(page,'/ai/goods/search',before); assert.equal(seen.input.source_revision,preview.source_revision);
    assert.equal(count('/ai/goods/item-read'),0); assert.ok(await page.waitFor('document.body.innerText.includes("Уход — категория")'));
    assert.equal((await snapshot(page)).controls.some(c=>c.tag==='BUTTON' && c.name==='Уход'),false);
    await checkpoint('searched',seen);
    before=count('/ai/goods/item-read'); await clickNamed(page,input.itemName+' · товар №123'); seen=await response(page,'/ai/goods/item-read',before);
    assert.equal(seen.input.goods_id,'123'); assert.equal(seen.input.source_revision,preview.source_revision); await fieldsBlank(page);
    assert.equal(count('/ai/goods/receipt-review'),0); await capture(page,'manual-fields-blank'); await checkpoint('detail',seen);
    await manualFields(page); before=count('/ai/goods/receipt-review'); await clickNamed(page,'Подготовить предложение прихода');
    seen=await response(page,'/ai/goods/receipt-review',before); assert.equal(seen.body.status,'approval_required'); assert.equal(seen.input.source_revision,preview.source_revision); assert.equal(seen.input.proposal.review_version,1);
    assert.ok(await page.waitFor('!!Q.all("button").find(el=>Q.visible(el)&&Q.name(el).startsWith("Отклонить приход"))'));
    await capture(page,'approval-only'); await checkpoint('reviewed',seen);
    await decide(page,'Отклонить приход','REJECTED'); await checkpoint('rejected');
    await fill(page,FIELDS.cost,'11.25'); before=count('/ai/goods/receipt-review'); await clickNamed(page,'Подготовить предложение прихода');
    seen=await response(page,'/ai/goods/receipt-review',before); assert.equal(seen.body.status,'approval_required'); assert.equal(seen.input.source_revision,preview.source_revision); assert.equal(seen.input.proposal.review_version,2);
    assert.ok(await page.waitFor('document.body.innerText.includes("28.125") && !!Q.all("button").find(el=>Q.visible(el)&&Q.name(el).startsWith("Подтвердить приход"))'));
    await checkpoint('corrected',seen);
    const terminalText=await decide(page,'Подтвердить приход','SUCCEEDED'); await capture(page,'approved'); await checkpoint('approved');
    await clickNamed(page,'Закрыть и очистить поля фото'); await clickNamed(page,'Товар по фото накладной');
    await checkpoint('cancel-start'); const cancelBefore=count('/ai/goods/photo-preview'); await upload(page,input.imagePaths.cancel);
    assert.ok(await page.waitFor('document.body.innerText.includes("Извлекаю предварительные строки")'));
    await checkpoint('cancel-inflight'); await clickNamed(page,'Закрыть и очистить поля фото'); await checkpoint('cancelled');
    await until(()=>page.apiRequests('/ai/goods/photo-preview').slice(cancelBefore).some(r=>r.finishedAt || r.failed),'late cancelled preview response');
    await page.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
    assert.equal(await page.eval(`!!document.querySelector('section[aria-label="Товар по фото накладной"]')`),false);
    await checkpoint('cancel-late');
    await clickNamed(page,'Товар по фото накладной'); before=count('/ai/goods/photo-preview'); await upload(page,input.imagePaths.unknown);
    const unknownCall=await until(()=>page.apiRequests('/ai/goods/photo-preview').slice(before).find(r=>r.finishedAt),'second preview'); assert.equal(unknownCall.status,201);
    const unknownPreview=JSON.parse(await page.responseBody(unknownCall.requestId)); assert.notEqual(unknownPreview.photo_sha256,preview.photo_sha256);
    await checkpoint('unknown-uploaded',{preview:unknownPreview}); await clickNamed(page,'Выбрать строку 1'); await checkpoint('unknown-selected');
    before=count('/ai/goods/search'); await fill(page,FIELDS.query,'другой товар'); await clickNamed(page,'Найти товар в YCLIENTS'); seen=await response(page,'/ai/goods/search',before);
    assert.equal(seen.input.source_revision,unknownPreview.source_revision); await checkpoint('unknown-searched',seen);
    before=count('/ai/goods/item-read'); await clickNamed(page,input.otherItemName+' · товар №124'); seen=await response(page,'/ai/goods/item-read',before);
    assert.equal(seen.input.source_revision,unknownPreview.source_revision); await fieldsBlank(page); await checkpoint('unknown-detail',seen);
    await manualFields(page); guards[0].armReviewLoss(); before=count('/ai/goods/receipt-review'); await clickNamed(page,'Подготовить предложение прихода');
    assert.ok(await page.waitFor('document.body.innerText.includes("повторная отправка отключена")'));
    assert.equal(count('/ai/goods/receipt-review'),before+1); assert.equal(await page.eval(`Q.all('button').find(el=>Q.name(el)==='Подготовить предложение прихода')?.disabled`),true);
    const lost=page.apiRequests('/ai/goods/receipt-review').at(-1); const lostInput=JSON.parse(await page.postData(lost)); assert.equal(lostInput.source_revision,unknownPreview.source_revision);
    await capture(page,'response-loss'); await checkpoint('unknown',{input:lostInput});
    while(Date.now()<nextLoginAt) await pause(Math.min(1000,nextLoginAt-Date.now()));
    const counts={goods:count('/ai/goods/'),intent:count('/widgets/intent')};
    await page.goto(origin+'/'); await login(page,input.email);
    assert.ok(await page.waitFor('document.body.innerText.replace(/\\s+/g," ").includes('+JSON.stringify(terminalText.replace(/\s+/g,' ').trim())+')'),'Saved canonical successful receipt retained');
    assert.equal(count('/ai/goods/'),counts.goods); assert.equal(count('/widgets/intent'),counts.intent); assert.equal(count('/ai/chat'),0);
    await capture(page,'reload'); await checkpoint('reload');
    await clickNamed(page,'Товар по фото накладной'); before=count('/ai/goods/photo-preview'); await upload(page,input.imagePaths.main);
    const revoked=await until(()=>page.apiRequests('/ai/goods/photo-preview').slice(before).find(r=>r.finishedAt),'revoked preview'); assert.ok([401,403].includes(revoked.status));
    assert.ok(await page.waitFor('document.body.innerText.includes("Сессия завершена")'));
    await capture(page,'revoked'); await checkpoint('revoked',{status:revoked.status});
    assert.deepEqual(guards.flatMap(g=>g.faults),['review_response_lost_after_real_http_201']);
    report.observations={explicitGesturesOnly:true,allReceiptFieldsManual:true,immutableVersions:[1,2],canonicalApprovalStates:['REJECTED','SUCCEEDED'],responseLoss:'REAL_HTTP_201_LOST_PENDING_APPROVAL_NOT_AE_UNKNOWN',reloadNoRetry:true,cancelLateSuppressed:true,sourceWitnessPreserved:true};
    for (const guard of guards) {
      assert.deepEqual(guard.blocked, []);
      assert.deepEqual(guard.errors, []);
    }
    for (const p of pages)
      assert.deepEqual(p.exceptions, [], "No runtime exceptions");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.failure = error.stack ?? error.message;
    if (pages.length) {
      try {
        await capture(pages.at(-1), "failure");
      } catch {
        report.failureCapture = "unavailable";
      }
    }
    throw error;
  } finally {
    report.network = pages.flatMap((p) =>
      [...p.requests.values()].map((r) => ({
        method: r.method,
        path: new URL(r.url).pathname,
        status: r.status ?? null,
        failed: r.failed ?? null,
      })),
    );
    report.guards = guards;
    try {
      fs.writeFileSync(
        path.join(output, "browser.json"),
        JSON.stringify(report, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    } finally {
      await cleanup();
      process.off("SIGTERM", terminate);
      process.off("disconnect", terminate);
      if (process.connected) process.disconnect();
    }
  }
}
if (
  process.argv[1] &&
  pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url
)
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
