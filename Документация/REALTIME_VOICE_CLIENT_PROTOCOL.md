# MAYA Realtime-голос: протокол для клиента (хендофф для Next.js `/new/`)

> Как подключить «живой голос Maya как ChatGPT» к УЖЕ РАБОТАЮЩЕМУ серверному мосту.
> Бэкенд (мост realtime↔Claude) готов и в проде — клиенту (Next.js `/new/`) нужно реализовать
> только **аудио-ввод/вывод + протокол сообщений** по этому документу. Мозг (Claude), инструменты
> YClients, RBAC, фильтр галлюцинаций, выбор модели, озвучка — всё на сервере, трогать не нужно.

---

## 1. Архитектура (что где)

```
[Браузер /new/]  ──wss──►  rt.malesthetic.pro/api/realtime  ──►  OpenAI gpt-realtime (уши+рот)
   PCM16 24k mic                 (наш мост на VPS)            ──►  Claude Sonnet (мозг + YClients)
   ◄── PCM16 24k речь ──         relay аудио + события
```
Клиент = микрофон + динамик + UI. Всё остальное уже на сервере.

---

## 2. Эндпоинт и авторизация

- **URL:** `wss://rt.malesthetic.pro/api/realtime` (только WSS, со страницы по HTTPS).
- Браузерный WebSocket не умеет кастомные заголовки → **авторизация ПЕРВЫМ сообщением** (TEXT JSON), сразу после `onopen`:

```json
{ "type": "auth",
  "session_token": "<localStorage 'web_session_token'>",   // веб-сессия (телефон/VK)
  "auth_data":     { ... },                                  // ИЛИ Telegram Login Widget
  "init_data":     "<Telegram.WebApp.initData>" }            // ИЛИ Telegram Mini App
```
Достаточно ОДНОГО из трёх полей (тот же источник, что у текущего текст-чата `/new/`).

- Сервер отвечает:
  - `{"type":"ready"}` — авторизация ок, можно начинать стримить микрофон;
  - `{"type":"error","message":"unauthorized"|"needs_consent"|"realtime_disabled"}` — затем закрывает.

---

## 3. Протокол сообщений (после `ready`)

**Клиент → сервер:**
- **BINARY** кадры = аудио микрофона: **PCM16, little-endian, mono, 24000 Гц**, кусками ~40–100 мс.
- TEXT `{"type":"bye"}` — завершить сессию (необязательно; можно просто закрыть WS).

**Сервер → клиент:**
- **BINARY** кадры = речь Maya: **PCM16, LE, mono, 24000 Гц** → проигрывать по очереди, без швов.
- TEXT-события (JSON):
  | type | смысл | что делать в UI |
  |---|---|---|
  | `transcript` `{text}` | что распознал у пользователя | показать как реплику пользователя |
  | `reply_text` `{text}` | текст ответа Maya | показать как реплику Maya |
  | `speaking_start` | Maya начала говорить | **заглушить микрофон**, орб «говорит» |
  | `speaking_done` | Maya договорила | **включить микрофон** (после доигрывания хвоста), орб «слушает» |
  | `interrupted` | перебивание | **остановить/сбросить воспроизведение** |
  | `error` `{message}` | сбой | показать/фолбэк на текст-чат |

---

## 4. 🔴 Главное: полудуплекс (иначе Maya слышит себя и зацикливается)

Пока Maya говорит — **НЕ слать аудио микрофона** (динамик ловится микрофоном → эхо-петля → она «троит»).
- `speaking_start` → `muted = true` (перестать отправлять mic-кадры).
- `speaking_done` → подождать, пока **доиграет весь запланированный звук** (`playHead - currentTime + ~0.35с`), и только потом `muted = false`.
- На `interrupted` → остановить воспроизведение и `muted = false`.
- getUserMedia с `echoCancellation:true, noiseSuppression:true, autoGainControl:true`.

(Сервер тоже дропает входящее аудио, пока говорит, — но клиентский mute нужен для «хвоста» и экономии трафика.)

---

## 5. Захват микрофона → PCM16 24k

```js
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
});
// просим 24кГц — браузер ресемплит качественно (без алиасинга → точнее распознавание)
let actx; try { actx = new (AudioContext||webkitAudioContext)({ sampleRate: 24000 }); }
catch { actx = new (AudioContext||webkitAudioContext)(); }
await actx.resume();                              // iOS: только после жеста пользователя!
const src  = actx.createMediaStreamSource(stream);
const proc = actx.createScriptProcessor(4096, 1, 1);
const mute = actx.createGain(); mute.gain.value = 0;     // выход в «никуда», чтобы proc работал
const inRate = actx.sampleRate, ratio = inRate / 24000;
proc.onaudioprocess = (e) => {
  if (muted || ws.readyState !== 1) return;
  const inp = e.inputBuffer.getChannelData(0);
  let out;
  if (ratio <= 1.01) {                            // уже 24к
    out = new Int16Array(inp.length);
    for (let i=0;i<inp.length;i++){ let v=Math.max(-1,Math.min(1,inp[i])); out[i]=v<0?v*0x8000:v*0x7FFF; }
  } else {                                         // усреднение окна (анти-алиасинг)
    const n = Math.floor(inp.length/ratio); out = new Int16Array(n);
    for (let i=0;i<n;i++){ const s=Math.floor(i*ratio),e2=Math.min(inp.length,Math.floor((i+1)*ratio));
      let a=0,k=0; for(let j=s;j<e2;j++){a+=inp[j];k++;} let v=Math.max(-1,Math.min(1,k?a/k:0)); out[i]=v<0?v*0x8000:v*0x7FFF; }
  }
  ws.send(out.buffer);
};
src.connect(proc); proc.connect(mute); mute.connect(actx.destination);
```

---

## 6. Воспроизведение PCM16 24k без швов (gapless)

```js
const outGain = actx.createGain(); outGain.connect(actx.destination);
let playHead = 0; const sources = [];
function playChunk(arrayBuf) {                     // ws.onmessage с бинарными данными
  const i16 = new Int16Array(arrayBuf); if (!i16.length) return;
  const f32 = new Float32Array(i16.length);
  for (let i=0;i<i16.length;i++) f32[i] = i16[i]/32768;
  const buf = actx.createBuffer(1, f32.length, 24000); buf.getChannelData(0).set(f32);
  const node = actx.createBufferSource(); node.buffer = buf; node.connect(outGain);
  const t = Math.max(actx.currentTime + 0.03, playHead);
  node.start(t); playHead = t + buf.duration;
  sources.push(node); node.onended = () => { const i=sources.indexOf(node); if(i>=0) sources.splice(i,1); };
}
function stopPlayback() { sources.forEach(s=>{try{s.stop()}catch{}}); sources.length=0; playHead=0; }
```

`ws.binaryType = "arraybuffer";` обязательно. В `ws.onmessage`: если `typeof ev.data !== "string"` → `playChunk(ev.data)`, иначе `JSON.parse` → обработка событий.

---

## 7. Поток жизни сессии

1. Жест пользователя (тап «Говорить») → создать AudioContext, `resume()`, получить mic **один раз**.
2. Открыть WS → `onopen` → отправить `{type:"auth",...}`.
3. Дождаться `{type:"ready"}` → запустить `proc` (стрим микрофона).
4. Крутить события: transcript/reply_text/speaking_start(mute)/speaking_done(unmute после хвоста)/interrupted(stopPlayback)/audio(playChunk).
5. Выход: `muted=true`, остановить proc, `stream.getTracks().forEach(t=>t.stop())`, закрыть WS и AudioContext.

---

## 8. Гочи (выстраданные на app.html)

- **iOS:** AudioContext только после жеста; один общий AudioContext на сессию; микрофон брать ОДИН раз (не на каждый круг — иначе iOS переспрашивает разрешение).
- **Эхо:** без mute-во-время-речи Maya слышит себя → зацикливается. Это критично.
- **Фолбэк:** если WS не поднялся/упал — откатиться на текущий текст-чат (`POST app/api-proxy.php?action=chat_stream`), чтобы голос не ронял весь чат.
- **Латентность:** на запрос с данными ответ может идти 5–15с (Claude+YClients через РФ-прокси); сервер сам подаёт фразу-филлер «секунду…», но UI должен показывать состояние «думает».
- Рабочая референс-реализация всего этого — в `app.html` (функции `rtStart/rtStop/rtPlay/rtStopPlayback/rtAuthMsg`). Можно прямо переносить логику в React-хук.

---

## 9. Что НЕ нужно делать на клиенте
Не реализовывать STT/TTS/выбор модели/промпты/инструменты — это всё на сервере. Клиент только: микрофон → WS (binary), WS (binary) → динамик, и обработка 6 типов событий. Всё.
