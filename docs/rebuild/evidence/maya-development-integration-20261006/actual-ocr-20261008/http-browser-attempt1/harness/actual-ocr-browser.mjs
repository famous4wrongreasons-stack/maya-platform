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
} from "./actual-ocr-browser-guard.mjs";

const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-carrier-react';
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const deadline = Date.now() + 25_000;
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
    }, 30_000);
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
async function upload(page,file) {
  assert.ok(await page.waitFor("!!Q.all('input[type=file]').find(el => !el.disabled)"), 'File picker must settle');
  const {root} = await page.send('DOM.getDocument');
  const {nodeId} = await page.send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type="file"]'});
  assert.ok(nodeId); await page.send('DOM.setFileInputFiles',{nodeId,files:[file]});
}

async function main() {
  assert.equal(process.connected, true, 'Use the owned actual-ocr.probe-spec.ts');
  const pendingInput = receive('start'); process.send({ type: 'ready' });
  const input = await pendingInput, backendOrigin = localOrigin(input.backendOrigin);
  assert.ok(path.isAbsolute(input.output));
  const output = path.join(input.output, 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const report = { contract: 'maya.actual-ocr-browser-preview/1', status: 'running',
    syntheticImages: true, scriptedOcr: false, parserStubbed: false,
    realDocumentAcceptance: false, deploymentAcceptance: false, snapshots: {}, observations: {} };
  let browser, dev, chromeChild, chromeProfile, closing;
  const pages = [], guards = [];
  const cleanup = () => closing ??= (async () => {
    try { await browser?.close(); }
    finally {
      if (chromeChild && chromeChild.exitCode === null) {
        const stopped = new Promise(resolve => chromeChild.once('exit', resolve));
        chromeChild.kill('SIGKILL'); await Promise.race([stopped, pause(2000)]);
      }
      if (chromeProfile) fs.rmSync(chromeProfile, { recursive: true, force: true });
      await dev?.close();
    }
  })();
  const terminate = () => { void cleanup().finally(() => process.exit(2)); };
  process.once('SIGTERM', terminate); process.once('disconnect', terminate);
  async function capture(page, name) {
    await page.eval(`Q.all('section').find(el => el.getAttribute('aria-label') === 'Товар по фото накладной')?.scrollIntoView({block:'start'})`);
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    report.snapshots[name] = await snapshot(page);
    const {data} = await page.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
    fs.writeFileSync(path.join(output, name+'.png'), Buffer.from(data,'base64'), { flag:'wx',mode:0o600 });
  }
  async function newPage(origin) {
    const page = await browser.newPage(); pages.push(page);
    guards.push(await installGuard(page, origin, { emails:[input.email] }));
    await page.send('Emulation.setDeviceMetricsOverride',{width:1280,height:1100,deviceScaleFactor:1,mobile:false});
    await page.goto(origin+'/'); return page;
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

    await login(page, input.email);
    const count = route => page.apiRequests(route).length;
    const forbidWorkflow = () => {
      for (const route of ['/ai/chat','/ai/goods/search','/ai/goods/item-read','/ai/goods/receipt-review','/widgets/intent']) assert.equal(count(route),0,route+' must not run');
    };
    await clickNamed(page,'Товар по фото накладной'); forbidWorkflow();
    await capture(page,'opened'); await checkpoint('opened');
    const steps = [
      { name:'uploaded', image:'russian', status:201 },
      { name:'changed', image:'changed', status:201 },
      { name:'blank', image:'blank', status:400 },
      { name:'malformed', image:'malformed', status:400 },
      { name:'revoked', image:'russian', status:null },
    ];
    for (const [index,step] of steps.entries()) {
      if (index > 0) {
        await clickNamed(page,'Закрыть и очистить поля фото');
        await clickNamed(page,'Товар по фото накладной');
      }
      const before = count('/ai/goods/photo-preview');
      await upload(page,input.imagePaths[step.image]);
      const call = await until(() => page.apiRequests('/ai/goods/photo-preview').slice(before).find(r=>r.finishedAt),step.name+' actual upload');
      const body = JSON.parse(await page.responseBody(call.requestId));
      if(step.status===null) assert.ok([401,403].includes(call.status)); else assert.equal(call.status,step.status);
      assert.equal(count('/ai/goods/photo-preview'),before+1,'No automatic retry');
      if(step.status===201) {
        assert.equal(body.recognition_acceptance,'NOT_ACCEPTED');
        const expected = input.expected[step.image];
        assert.equal(body.lines.length,expected.length);
        for (const row of expected) {
          assert.ok(await page.waitFor('document.body.innerText.includes('+JSON.stringify(row.name)+')'),'Visible OCR name tracks actual pixels');
          const visible = await snapshot(page);
          for (const text of ['количество: '+row.quantity, 'единица: '+row.unit_label, 'Поле цены: '+row.unit_price, 'Отдельное поле суммы строки: '+row.line_total]) assert.ok(visible.text.includes(text),text);
        }
        assert.ok((await snapshot(page)).text.includes('Каждую строку нужно сверить с документом'));
        if(step.name==='changed') assert.ok(!(await snapshot(page)).text.includes(input.expected.russian[0].name),'Previous image rows cleared');
      } else {
        const expectedText = step.name==='blank' ? 'Поддерживается только простая таблица с пятью заголовками' : step.name==='malformed' ? 'Нужен один файл PNG, JPEG или WebP до 2 МиБ.' : null;
        if(expectedText) assert.ok(await page.waitFor('document.body.innerText.includes('+JSON.stringify(expectedText)+')'));
        else assert.ok(await page.waitFor('/Сессия завершена|Подготовка прихода сейчас недоступна/.test(document.body.innerText)'));
        assert.equal(body.lines,undefined);
        assert.ok(!(await snapshot(page)).text.includes('Предварительные строки'));
      }
      forbidWorkflow();
      assert.ok(!(await snapshot(page)).controls.some(c=>c.name==='Подготовить предложение прихода'));
      await capture(page,step.name); await checkpoint(step.name,{body,status:call.status});
    }
    for(const guard of guards) { assert.deepEqual(guard.blocked,[]); assert.deepEqual(guard.errors,[]); }
    for(const page of pages) assert.deepEqual(page.exceptions,[]);
    report.observations = { explicitUploads:5, noAutomaticMatching:true, noReceiptPreparation:true,
      noApprovalOrAE:true, preRequestRevocation:true, inFlightRevocationClaim:false, nativeImages:['russian','changed','blank'] };
    report.status='passed';
  } catch(error) {
    report.status='failed'; report.failure=error.stack??error.message;
    if(pages.length) try { await capture(pages.at(-1),'failure'); } catch { report.failureCapture='unavailable'; }
    throw error;
  } finally {
    report.network=pages.flatMap(page=>[...page.requests.values()].map(r=>({method:r.method,path:new URL(r.url).pathname,status:r.status??null,failed:r.failed??null})));
    report.guards=guards;
    try { fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600}); }
    finally { await cleanup(); process.off('SIGTERM',terminate); process.off('disconnect',terminate); if(process.connected)process.disconnect(); }
  }
}
if(process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href===import.meta.url) main().catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
