/* R09 uses only anonymous source facts. The existing transport owns cookie and
   source signatures; public code never supplies tenant/User/Client authority. */
var MayaPublicCommunity = (function () {
  function normal(text) { return String(text || '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\0/g, '').trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'); }
  function author(text) { return String(text || '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[^0-9a-zA-Zа-яА-ЯёЁ .'-]/g, '').trim() || 'Гость'; }
  async function status(slug) {
    var response = await k('site_event_status', { slug: slug });
    var data = await response.json();
    if (!response.ok || !data.ok || !/^[a-f0-9]{64}$/.test(data.sourceScope || '')) throw Error('Обсуждение сейчас недоступно.');
    return data;
  }
  function storage(scope, operation) { return 'maya.r09.pending.v1:' + scope + ':' + operation; }
  async function command(operation, slug, value, transport) {
    var initial = await status(slug), storeKey = storage(initial.sourceScope, operation), pending;
    try { pending = JSON.parse(sessionStorage.getItem(storeKey) || 'null'); } catch (_) { throw Error('Не удалось восстановить предыдущий запрос.'); }
    var intent = operation === 'comment' ? { slug: slug, text: normal(value.text), display_name: author(value.display_name), consent: value.consent === true, consent_policy_version: 'public-comment-consent/1' } : operation === 'like' ? { slug: slug, liked: value.liked === true } : { slug: slug };
    if (pending && (pending.scope !== initial.sourceScope || pending.operation !== operation || JSON.stringify(pending.intent) !== JSON.stringify(intent))) return { status: 409, data: { ok: false, error: 'PENDING_COMMAND_MUST_BE_RETRIED_UNCHANGED', message: 'Повторите исходный запрос: его результат ещё не подтверждён.' } };
    if (!pending) {
      if (!crypto.randomUUID) throw Error('Обновите браузер для безопасного повтора.');
      pending = { scope: initial.sourceScope, operation: operation, intent: intent, key: crypto.randomUUID(), expectedVersion: operation === 'like' ? initial.stats.version : null };
      sessionStorage.setItem(storeKey, JSON.stringify(pending));
    }
    var body = Object.assign({}, pending.intent, { request_key: pending.key });
    if (operation === 'like') body.expected_version = pending.expectedVersion;
    if (operation === 'comment') {
      body.form_token = transport && transport.form_token || initial.form_token;
      body.website = transport && transport.website || '';
      // A refreshed form token is transport protection, outside immutable intent.
      var age = Date.now() / 1000 - Number(String(body.form_token).split('.')[0]);
      if (age > 7100 || age < 0) { body.form_token = initial.form_token; age = 0; }
      if (age < 2) await new Promise(function (resolve) { setTimeout(resolve, Math.ceil((2.1 - age) * 1000)); });
    }
    var response, data;
    try { response = await k('site_event_' + operation, body); data = await response.json(); }
    catch (_) { return { status: 503, data: { ok: false, error: 'community_receipt_unconfirmed', message: 'Результат пока не подтверждён. Повторите тот же запрос.' } }; }
    if (response.status >= 500 || !data || typeof data !== 'object') return { status: 503, data: { ok: false, error: 'community_receipt_unconfirmed' } };
    if (response.ok && data.ok && data.contract !== 'maya.public-community/1') return { status: 503, data: { ok: false, error: 'community_receipt_unconfirmed' } };
    if (response.ok && data.ok || [400, 401, 403, 404, 409, 410, 422, 429].indexOf(response.status) >= 0) sessionStorage.removeItem(storeKey);
    if (response.ok && data.ok) {
      // Projection failure after an accepted receipt must not reopen the intent.
      try { var current = await status(slug); data = Object.assign({}, current, data); } catch (_) {}
    }
    return { status: response.status, data: data };
  }
  return { status: status, command: command };
})();
