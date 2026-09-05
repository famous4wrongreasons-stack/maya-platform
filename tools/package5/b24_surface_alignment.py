"""B24 exact Web Push overlays for the active PWA and proxy. No legacy authority."""
import argparse
from pathlib import Path

PWA_PUSH = r'''  // p5_b24_verified_web_push_v1: server receipt, never browser permission as registration proof.
  function __mePushStatus(value) {
    window.__meWebPushStatus = value;
    window.dispatchEvent(new CustomEvent('me-web-push-status', { detail: value }));
    return value;
  }
  function __mePushFailure(error) {
    var limited = error && error.message === 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED';
    return __mePushStatus({ ok: false, error: limited ? 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED' : 'WEB_PUSH_UNAVAILABLE',
      message: limited ? 'Подключено пять устройств. Сначала отключите уведомления на одном из них.' : 'Уведомления не подключены. Проверьте вход и подтверждённую связь с клиентом.' });
  }
  function __mePushCall(action, data) {
    var rq = window.__meAuthReq && window.__meAuthReq(data);
    if (!rq) return Promise.reject(new Error('CLIENT_LINK_REQUIRED'));
    return fetch('https://malesthetic.pro/app/api-proxy.php?action=' + action, { method: 'POST', headers: rq.headers, body: rq.body }).then(function (r) {
      return r.json().then(function (value) {
        if (!r.ok || !value.ok || !value.endpointId) throw new Error(value.error === 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED' ? value.error : 'WEB_PUSH_UNAVAILABLE');
        return value;
      });
    });
  }
  window.__meSubscribePush = function (manual) {
    try {
      if (!manual && localStorage.getItem('me_web_push_disabled') === '1') return Promise.resolve(__mePushStatus({ ok: true, status: 'INACTIVE', message: 'Уведомления на этом устройстве отключены.' }));
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined' || Notification.permission === 'denied') return Promise.resolve(__mePushFailure());
      var permission = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      return permission.then(function (p) {
        if (p !== 'granted') throw new Error('PERMISSION_REQUIRED');
        return __meRegisterPushWorker();
      }).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: __meU8FromB64Url(__ME_VAPID) }); });
      }).then(function (sub) {
        return __mePushCall('push_subscribe', { subscription: sub.toJSON() });
      }).then(function (receipt) {
        if (receipt.status !== 'ACTIVE') throw new Error('ENDPOINT_INACTIVE');
        localStorage.setItem('me_web_push_episode_id', receipt.endpointId);
        localStorage.removeItem('me_web_push_disabled');
        return __mePushStatus({ ok: true, status: 'ACTIVE', message: 'Это устройство подключено. Отправка зависит от ваших согласий и настроек.' });
      }).catch(__mePushFailure);
    } catch (error) { return Promise.resolve(__mePushFailure(error)); }
  };
  window.__meUnsubscribePush = function () {
    var id;
    try { id = localStorage.getItem('me_web_push_episode_id'); } catch (_) {}
    if (!id) return Promise.resolve(__mePushStatus({ ok: false, message: 'Сначала подтвердите подключение этого устройства.' }));
    return __mePushCall('push_unsubscribe', { endpointId: id }).then(function (receipt) {
      if (receipt.status !== 'INACTIVE') throw new Error('UNSUBSCRIBE_NOT_CONFIRMED');
      localStorage.setItem('me_web_push_disabled', '1');
      localStorage.removeItem('me_web_push_episode_id');
      return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { return sub ? sub.unsubscribe() : true; }).catch(function () { return false; }).then(function () {
        return __mePushStatus({ ok: true, status: 'INACTIVE', message: 'Уведомления на этом устройстве отключены.' });
      });
    }).catch(__mePushFailure);
  };
'''

PWA_CONTROL = r'''// p5_b24_web_push_controls: only a confirmed server outcome is displayed as success.
function AWebPushControls(props) {
  var e = React.createElement, c = props.colors;
  var pair = React.useState(window.__meWebPushStatus || { message: 'Подключите это устройство для разрешённых уведомлений.' });
  var state = pair[0], update = pair[1], pending = React.useState(false), busy = pending[0], setBusy = pending[1];
  React.useEffect(function () { function changed(event) { update(event.detail); } window.addEventListener('me-web-push-status', changed); return function () { window.removeEventListener('me-web-push-status', changed); }; }, []);
  function call(name) { setBusy(true); Promise.resolve().then(function () { if (!window[name]) throw new Error('unavailable'); return window[name](true); }).catch(function () { update({ message: 'Не удалось подтвердить изменение. Попробуйте ещё раз.' }); }).then(function () { setBusy(false); }); }
  var button = { font: 'inherit', fontSize: 12, padding: '9px 12px', borderRadius: 12, border: '1px solid ' + c.line, color: c.ink, background: 'transparent', cursor: busy ? 'wait' : 'pointer' };
  return e('div', { style: { borderTop: '1px solid ' + c.line, paddingTop: 14, marginTop: 10 } },
    e('div', { style: { fontSize: 13, fontWeight: 600, color: c.ink } }, 'Уведомления на этом устройстве'),
    e('div', { role: 'status', 'aria-live': 'polite', style: { fontSize: 12, lineHeight: 1.5, color: c.muted || c.dim, margin: '6px 0 10px' } }, state.message),
    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
      e('button', { type: 'button', disabled: busy, style: button, onClick: function () { call('__meSubscribePush'); } }, busy ? 'Проверяем…' : 'Подключить устройство'),
      e('button', { type: 'button', disabled: busy, style: button, onClick: function () { call('__meUnsubscribePush'); } }, 'Отключить устройство')));
}
'''

PROXY_PUSH = r'''    case 'push_subscribe':
    case 'push_unsubscribe':
        // p5_b24_verified_web_push_v1: the backend verifies canonical Client binding.
        $push_keys = $action === 'push_subscribe' ? ['subscription', 'expectedEndpointId'] : ['endpointId'];
        $push_allowed = array_merge($push_keys, ['auth_data', 'session_token', 'maya_token']);
        if (array_diff(array_keys($input), $push_allowed)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'invalid_push_request']);
            break;
        }
        $push_input = array_intersect_key($input, array_flip($push_allowed));
        $push_headers = ['Content-Type: application/json', 'Accept: application/json'];
        $push_init = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $push_auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($push_init !== '') $push_headers[] = 'X-Telegram-InitData: ' . $push_init;
        if ($push_auth !== '') $push_headers[] = 'Authorization: ' . $push_auth;
        $push_path = $action === 'push_subscribe' ? '/api/push/subscribe' : '/api/push/unsubscribe';
        $ch = curl_init($TG_CONFIG['bot_api_base'] . $push_path);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($push_input), CURLOPT_HTTPHEADER => $push_headers,
            CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $failed = curl_errno($ch) !== 0;
        curl_close($ch);
        if ($failed || !$status || !$body) {
            http_response_code(502);
            echo json_encode(['ok' => false, 'error' => 'push_unavailable']);
            break;
        }
        http_response_code($status);
        echo $body;
        break;
'''


def align_pwa(source):
    if 'p5_b24_verified_web_push_v1' in source:
        verify_pwa(source)
        return source
    start = source.index('  window.__meSubscribePush = function () {')
    end = source.index('  var __mePushTries = 0;', start)
    source = source[:start] + PWA_PUSH + source[end:]
    anchor = 'function ANotifyCard(props) {'
    assert source.count(anchor) == 1
    source = source.replace(anchor, PWA_CONTROL + '\n' + anchor)
    start = source.index(anchor)
    end = source.index('window.ANotifyCard = ANotifyCard;', start)
    card = source[start:end]
    card = card.replace("ROWS.map(function (r, i)", "e(AWebPushControls, { colors: c }), ROWS.map(function (r, i)")
    source = source[:start] + card + source[end:]
    start = source.index('function ASettings() {')
    end = source.index('window.ASettings = ASettings;', start)
    settings = source[start:end].replace("Eb('Напоминания'),", "e(AWebPushControls, { colors: t }), Eb('Напоминания'),")
    source = source[:start] + settings + source[end:]
    verify_pwa(source)
    return source


def align_proxy(source):
    start = source.index("    case 'push_subscribe':")
    end = source.index("    case 'tip_sent':", start)
    source = source[:start] + PROXY_PUSH + '\n' + source[end:]
    verify_proxy(source)
    return source


def verify_pwa(source):
    assert PWA_PUSH in source and PWA_CONTROL in source, 'B24 verified registration/lifecycle altered'
    assert source.count('e(AWebPushControls, { colors:') == 2, 'B24 confirmed status controls missing'


def verify_proxy(source):
    assert PROXY_PUSH in source, 'B24 canonical push proxy altered'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('kind', choices=('pwa', 'proxy'))
    parser.add_argument('file', type=Path)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        (verify_pwa if args.kind == 'pwa' else verify_proxy)(args.file.read_text())
    else:
        args.file.write_text((align_pwa if args.kind == 'pwa' else align_proxy)(args.file.read_text()))
