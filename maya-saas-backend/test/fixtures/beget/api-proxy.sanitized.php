<?php
/** R02 transparent credential forwarding, never actor or role resolution. */
function maya_r02_staff_payload(string $encoded, array $input): string {
    $body = json_decode($encoded, true);
    if (!is_array($body)) throw new InvalidArgumentException('Invalid canonical staff payload');
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    $header = is_string($authorization) && str_starts_with($authorization, 'Bearer ') ? substr($authorization, 7) : '';
    $token = $input['maya_token'] ?? '';
    if (!is_string($token) || ($header !== '' && $token !== '' && !hash_equals($header, $token))) {
        throw new InvalidArgumentException('Conflicting canonical staff credentials');
    }
    $token = $header !== '' ? $header : $token;
    if ($token !== '') {
        if (strlen($token) > 4096 || preg_match('/[\r\n]/', $token)) throw new InvalidArgumentException('Invalid canonical staff credential');
        $body['maya_token'] = $token;
    }
    return json_encode($body, JSON_THROW_ON_ERROR);
}

header('Content-Type: application/json; charset=utf-8');

$allowed_origins = [
    // Android Capacitor shell с hostname=malesthetic.pro по умолчанию живёт на http-origin.
    // Без него native APK видит CORS-ошибку на api-proxy.php и не может начать login flow.
    'https://malesthetic.pro',
    'http://malesthetic.pro',
    'https://www.malesthetic.pro',
    'http://www.malesthetic.pro',
    'https://мужскаяэстетика.рф',
    'http://мужскаяэстетика.рф',
    'https://www.мужскаяэстетика.рф',
    'http://www.мужскаяэстетика.рф',
    'https://xn--80aaocmjdk0cclbf8l3a.xn--p1ai',
    'http://xn--80aaocmjdk0cclbf8l3a.xn--p1ai',
    'https://www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai',
    'http://www.xn--80aaocmjdk0cclbf8l3a.xn--p1ai',
    'https://mocine3388.beget.tech',
    'http://mocine3388.beget.tech',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$origin = rtrim($origin, '/');
$site_preview = in_array($origin, ['http://localhost:8770', 'http://127.0.0.1:8770'], true)
    && strpos((string)($_GET['action'] ?? ''), 'site_') === 0;
$allowed = empty($origin) || $origin === 'null' || $site_preview || in_array($origin, $allowed_origins);

if (!$allowed) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit();
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$now = time();
// Rate-limit разделён по action, чтобы активный просмотр расписания/чата не съедал
// общий IP-лимит и не блокировал финальную кнопку «Записаться» у клиентов за одним NAT.
$rl_action = preg_replace('/[^a-zA-Z0-9_:-]/', '_', (string)($_GET['action'] ?? 'default'));
$rate_cap = 90;
if ($rl_action === 'team_chat_fetch' || $rl_action === 'team_chat_media' || $rl_action === 'team_chat_upload_chunk') {
    $rate_cap = 600;
} elseif (in_array($rl_action, ['team_chat_upload_init', 'team_chat_upload_finish', 'team_chat_upload_abort', 'team_chat_send'], true)) {
    $rate_cap = 300;
} elseif (in_array($rl_action, ['get_services', 'get_dates', 'get_times', 'nearest_slot', 'booking_prefill', 'auth_status'], true)) {
    $rate_cap = 180;
} elseif (in_array($rl_action, ['create_record', 'client_book_loyalty', 'chat', 'chat_stream', 'chat_history', 'chat_delete', 'client_cancel_record', 'client_reschedule_record'], true)) {
    $rate_cap = 45;
} elseif (strpos($rl_action, 'auth_') === 0 || strpos($rl_action, 'applogin_') === 0 || strpos($rl_action, 'vk') !== false || strpos($rl_action, 'yandex') !== false) {
    $rate_cap = 30;
}
$rate_file = sys_get_temp_dir() . '/rate_' . md5($ip . '|' . $rl_action) . '.json';
$rate_data = file_exists($rate_file) ? (json_decode(file_get_contents($rate_file), true) ?: []) : [];
$rate_data = array_values(array_filter($rate_data, fn($t) => $now - $t < 60));
if (count($rate_data) >= $rate_cap) {
    http_response_code(429);
    echo json_encode([
        'success' => false,
        'error' => 'rate_limited',
        'message' => 'Слишком много запросов. Подождите несколько секунд и попробуйте ещё раз.',
        'retry_after' => 60,
    ]);
    exit();
}
$rate_data[] = $now;
file_put_contents($rate_file, json_encode($rate_data));

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Telegram-InitData, X-TG-Auth, X-Session-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

define('PARTNER_TOKEN', 'FIXTURE_ONLY_NOT_A_CREDENTIAL');
define('COMPANY_ID', '999999999');
define('YC_API', 'https://api.yclients.com/api/v1');
define('TEAM_MEDIA_TTL_SECONDS', 172800); // 2 days
define('TEAM_MEDIA_MAX_VIDEO_BYTES', 1073741824); // 1 GiB
define('TEAM_MEDIA_CHUNK_BYTES', 6291456); // 6 MiB

// Telegram-конфиг (BOT_TOKEN и пр.) — лежит в защищённом файле рядом
$TG_CONFIG = @include __DIR__ . '/tg-config.php';
if (!is_array($TG_CONFIG)) $TG_CONFIG = ['bot_token' => '', 'bot_username' => '', 'auth_max_age' => 2592000, 'bot_api_base' => 'http://111.88.148.206:8080'];

// R12: private TeamAttachment storage is owned by the canonical executor/AC6.

$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true) ?: [];

// Guest discussion uses a signed gateway, separate from customer operations.
if (in_array($action, ['site_guest_chat', 'site_event_status', 'site_event_view', 'site_event_like', 'site_event_comment', 'site_event_moderation', 'site_event_resolve'], true)) {
    require_once __DIR__ . '/site-community-proxy.php';
    forward_site_community($action, is_array($input) ? $input : [], $TG_CONFIG);
    exit;
}
if (in_array($action, ['site_post_list', 'site_post', 'site_post_media'], true)) {
    require_once __DIR__ . '/site-publications-proxy.php';
    forward_site_publication($action, $TG_CONFIG['bot_api_base']);
    exit;
}

switch ($action) {

    case 'version':
        echo json_encode(['success' => true, 'version' => 'v7_tgauth']);
        break;

	    case 'team_chat_media':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'team_chat_upload_init':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'team_chat_upload_chunk':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'team_chat_upload_finish':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'team_chat_upload_abort':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'auth_status':
        // Какие способы входа сейчас живые — для огоньков на кнопках входа.
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/status');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err || !$body) { echo json_encode(['telegram' => true, 'vk' => false, 'yandex' => false, 'phone' => false]); break; }
        echo $body;
        break;

    case 'send_sms':
    case 'verify_sms':
        // SMS-авторизация удалена из приложения. Вход — только ВКонтакте / Telegram.
        echo json_encode(['success' => false, 'error' => 'sms_disabled']);
        break;

    // =====================================================================
    // НОВОЕ: Вход через VK ID (без Telegram, без VPN).
    // Фронт после редиректа VK прислал {code,redirect_uri}; пробрасываем на
    // бэкенд (VPS), он меняет code на токен по защищённому ключу и заводит сессию.
    // =====================================================================
    case 'vk_auth':
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/vk');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($input),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['success' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // VK ID SDK (виджет OAuthList «Войти через приложение ВК»): фронт получил токены
    // через VKID.Auth.exchangeCode и шлёт {access_token, user_id} → backend заводит сессию.
    case 'vk_sdk_auth':
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/vk-sdk');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($input),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    // Yandex ID OAuth: фронт просит auth_url, а затем присылает code.
    case 'yandex_start':
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/yandex/start');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($input),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    case 'yandex_auth':
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/yandex');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($input),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    // B20: canonical Maya JWT is the only session credential that may resolve
    // a Client. The legacy X-Session-Token is forwarded only so the backend can
    // return the unlinked representation; the proxy never maps it to identity.
    case 'cabinet_session':
        $headers = ['Content-Type: application/json', 'Accept: application/json'];
        $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($authorization !== '') {
            if (!is_string($authorization) || strpbrk($authorization, "\r\n") !== false) {
                http_response_code(400);
                echo '{"error":"invalid_authorization"}';
                break;
            }
            $headers[] = 'Authorization: ' . $authorization;
        } else {
            $token = $_SERVER['HTTP_X_SESSION_TOKEN'] ?? '';
            if (is_string($token) && strpbrk($token, "\r\n") === false)
                $headers[] = 'X-Session-Token: ' . $token;
        }
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/cabinet/me-via-session');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '{}',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['success' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // Отправка кода подтверждения номера (SMS через YClients) — привязка телефона из ЛК
    case 'auth_phone_start':
        $payload = json_encode(['phone' => $input['phone'] ?? '']);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/auth/phone/start');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    // Нативный вход через Telegram (deep-link) для standalone-приложения:
    // приложение создаёт nonce → получает deep-link на бота → опрашивает статус.
    case 'applogin_start':
        $payload = json_encode(['nonce' => $input['nonce'] ?? '']);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/applogin/start');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    case 'applogin_poll':
        $payload = json_encode(['nonce' => $input['nonce'] ?? '']);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/applogin/poll');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false,"error":"empty_response"}';
        break;

    // Привязка подтверждённого номера к Telegram-клиенту (код из SMS + текущая авторизация)
    case 'cabinet_link_phone':
        require_once __DIR__ . '/package5-client-consent-proxy.php';
        maya_client_consent_proxy($action, $input, $TG_CONFIG);
        break;

    // Персональные настройки уведомлений клиента (get без prefs / set с prefs)
    case 'native_feedback':
        require_once __DIR__ . '/package5-client-consent-proxy.php';
        maya_client_consent_proxy($action, $input, $TG_CONFIG);
        break;

    case 'notify_prefs':
        require_once __DIR__ . '/package5-client-consent-proxy.php';
        maya_client_consent_proxy($action, $input, $TG_CONFIG);
        break;

    case 'get_services':
        $company_id = intval($_GET['company_id'] ?? COMPANY_ID);
        $staff_id   = intval($_GET['staff_id'] ?? 0);
        $url = YC_API . "/book_services/{$company_id}/";
        if ($staff_id) $url .= "?staff_id={$staff_id}";
        $result   = yc_get($url);
        $services = $result['data']['services'] ?? ($result['data'] ?? []);
        echo json_encode(['success' => true, 'data' => ['services' => $services]]);
        break;

    case 'get_dates':
        $company_id = intval($_GET['company_id'] ?? COMPANY_ID);
        $staff_id   = intval($_GET['staff_id'] ?? 0);
        // service_id может прийти списком через запятую — несколько услуг за один визит
        $service_ids = array_filter(array_map('intval', explode(',', (string)($_GET['service_id'] ?? '0'))));
        if (!$service_ids) $service_ids = [0];
        $svc_parts = array();
        foreach ($service_ids as $sid) { $svc_parts[] = 'service_ids[]=' . $sid; }
        $svc_q = implode('&', $svc_parts);
        $date_from  = $_GET['date_from'] ?? date('Y-m-d');
        $date_to    = $_GET['date_to']   ?? date('Y-m-d', strtotime('+30 days'));
        $url    = YC_API . "/book_dates/{$company_id}/?staff_id={$staff_id}&{$svc_q}&date_from={$date_from}&date_to={$date_to}&with_seances=1";
        $result = yc_get($url);
        echo json_encode(['success' => true, 'data' => $result['data']['booking_dates'] ?? []]);
        break;

    case 'get_times':
        $company_id = intval($_GET['company_id'] ?? COMPANY_ID);
        $staff_id   = intval($_GET['staff_id'] ?? 0);
        // service_id может прийти списком через запятую — несколько услуг за один визит
        $service_ids = array_filter(array_map('intval', explode(',', (string)($_GET['service_id'] ?? '0'))));
        if (!$service_ids) $service_ids = [0];
        $svc_parts = array();
        foreach ($service_ids as $sid) { $svc_parts[] = 'service_ids[]=' . $sid; }
        $svc_q = implode('&', $svc_parts);
        $date       = $_GET['date'] ?? date('Y-m-d');
        $url    = YC_API . "/book_times/{$company_id}/{$staff_id}/{$date}/?{$svc_q}";
        $result = yc_get($url);
        $times  = [];
        foreach (($result['data'] ?? []) as $item) {
            $t = is_string($item) ? $item : ($item['time'] ?? ($item['datetime'] ?? ''));
            if (strlen($t) >= 5) $times[] = strlen($t) > 5 ? substr($t, 11, 5) : $t;
        }
        echo json_encode(['success' => true, 'data' => $times]);
        break;

    case 'create_record':
        // R01: raw phone/guest/provider-token input is not canonical Client authority.
        http_response_code(410);
        echo json_encode([
            'success' => false, 'accepted' => false, 'retry_allowed' => false,
            'code' => 'verified_client_channel_required',
            'error' => 'Для записи откройте MAYA в приложении и подтвердите привязку клиента.',
            'message' => 'Для записи откройте MAYA в приложении и подтвердите привязку клиента.',
            'canonical_url' => 'https://malesthetic.pro/app/',
        ], JSON_UNESCAPED_UNICODE);
        break;

    case 'cabinet_me':
        // ЛК через Telegram Mini App (X-Telegram-InitData)
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/cabinet/me');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'X-Telegram-InitData: ' . $init_data,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // НОВОЕ: Авторизация через Telegram Login Widget (для PWA в браузере)
    // Валидируем подпись хэша используя BOT_TOKEN
    // =====================================================================
    case 'tg_login_verify':
        $bot_token = $TG_CONFIG['bot_token'] ?? '';
        if (!$bot_token) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'bot_token_not_configured']);
            break;
        }

        // Данные от Telegram Widget — приходят в body POST
        $auth_data = $input['auth_data'] ?? [];
        if (!is_array($auth_data) || empty($auth_data['hash']) || empty($auth_data['id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'invalid_payload']);
            break;
        }

        $valid = tg_verify_login_widget($auth_data, $bot_token, $TG_CONFIG['auth_max_age'] ?? 2592000);
        if (!$valid) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'invalid_signature_or_expired']);
            break;
        }

        // Подпись валидна — возвращаем юзеру его данные + переподписанный токен
        echo json_encode([
            'success' => true,
            'user' => [
                'id'         => (int)$auth_data['id'],
                'first_name' => $auth_data['first_name'] ?? '',
                'last_name'  => $auth_data['last_name'] ?? '',
                'username'   => $auth_data['username'] ?? '',
                'photo_url'  => $auth_data['photo_url'] ?? '',
                'auth_date'  => (int)($auth_data['auth_date'] ?? 0),
            ],
        ]);
        break;

    // =====================================================================
    // НОВОЕ: ЛК для авторизованной через Login Widget PWA
    // Принимает auth_data (то же что отдал tg_login_verify),
    // валидирует и форвардит в бот вместе с подписанным telegram_id
    // =====================================================================
    case 'cabinet_me_login':
        $bot_token = $TG_CONFIG['bot_token'] ?? '';
        if (!$bot_token) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'bot_token_not_configured']);
            break;
        }

        $auth_data = $input['auth_data'] ?? [];
        if (!tg_verify_login_widget($auth_data, $bot_token, $TG_CONFIG['auth_max_age'] ?? 2592000)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'invalid_auth']);
            break;
        }

        // Форвардим в бот — он валидирует ещё раз своим токеном и отдаст данные ЛК
        $payload = json_encode(['auth_data' => $auth_data]);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/cabinet/me-via-login');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable', 'detail' => $err]);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // Имя и полный телефон для финального шага онлайн-записи.
    // Бот отдаёт полный телефон только авторизованному клиенту с согласием на ПД.
    case 'booking_prefill':
        $payload = json_encode([
            'auth_data'     => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? '',
        ]);
        $hdrs = ['Content-Type: application/json', 'Accept: application/json'];
        if (!empty($_SERVER['HTTP_X_TELEGRAM_INITDATA'])) {
            $hdrs[] = 'X-Telegram-InitData: ' . $_SERVER['HTTP_X_TELEGRAM_INITDATA'];
        }
        if (!empty($_SERVER['HTTP_X_SESSION_TOKEN'])) {
            $hdrs[] = 'X-Session-Token: ' . $_SERVER['HTTP_X_SESSION_TOKEN'];
        }
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $hdrs[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
        }
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/booking/prefill');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => $hdrs,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // Запись с одной допуслугой за баллы. Цену, баланс, каталог и слот
    // повторно проверяет Python-backend; PHP ничего не рассчитывает.
    case 'client_book_loyalty':
        $payload = json_encode([
            'staff_id'             => $input['staff_id'] ?? null,
            'service_ids'          => $input['service_ids'] ?? [],
            'datetime'             => (string)($input['datetime'] ?? ''),
            'loyalty_service_id'   => $input['loyalty_service_id'] ?? null,
            'loyalty_service_title'=> (string)($input['loyalty_service_title'] ?? ''),
            'request_id'           => (string)($input['request_id'] ?? ''),
            'auth_data'            => $input['auth_data'] ?? null,
            'session_token'        => $input['session_token'] ?? '',
        ]);
        $hdrs = ['Content-Type: application/json', 'Accept: application/json'];
        if (!empty($_SERVER['HTTP_X_TELEGRAM_INITDATA'])) {
            $hdrs[] = 'X-Telegram-InitData: ' . $_SERVER['HTTP_X_TELEGRAM_INITDATA'];
        }
        if (!empty($_SERVER['HTTP_X_SESSION_TOKEN'])) {
            $hdrs[] = 'X-Session-Token: ' . $_SERVER['HTTP_X_SESSION_TOKEN'];
        }
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/client/book-with-loyalty');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => $hdrs,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // B17: proxy forwards signed channel proof only. Canonical backend resolves
    // ClientChannelLink and exact Appointment ownership before Action Engine.
    case 'client_cancel_record':
    case 'client_reschedule_record':
        $client_record_path = $action === 'client_cancel_record'
            ? '/api/client/cancel-record'
            : '/api/client/reschedule-record';
        $payload = json_encode([
            'record_id'     => $input['record_id'] ?? null,
            'date'          => (string)($input['date'] ?? ''),
            'time'          => (string)($input['time'] ?? ''),
            'datetime'      => (string)($input['datetime'] ?? ''),
            'auth_data'     => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? '',
        ]);
        $hdrs = ['Content-Type: application/json', 'Accept: application/json'];
        if (!empty($_SERVER['HTTP_X_TELEGRAM_INITDATA'])) {
            $hdrs[] = 'X-Telegram-InitData: ' . $_SERVER['HTTP_X_TELEGRAM_INITDATA'];
        }
        if (!empty($_SERVER['HTTP_X_SESSION_TOKEN'])) {
            $hdrs[] = 'X-Session-Token: ' . $_SERVER['HTTP_X_SESSION_TOKEN'];
        }
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $hdrs[] = 'Authorization: ' . $_SERVER['HTTP_AUTHORIZATION'];
        }
        $ch = curl_init($TG_CONFIG['bot_api_base'] . $client_record_path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => $hdrs,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: кто я (роль + права). Работает и в Mini App
    // (X-Telegram-InitData), и в PWA (auth_data). Подпись проверяет бот.
    // =====================================================================
    case 'panel_me':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/me');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: дашборд аналитики. Роль (owner/manager) проверяет бот.
    // =====================================================================
    case 'panel_dashboard':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'days'      => $input['days'] ?? 30,
            'period'    => $input['period'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/dashboard');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // Дневной отчёт владельцу: зарплаты работающих барберов + нал/карта. Роль проверяет бот.
    case 'panel_daily_report':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'date'      => $input['date'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/daily_report');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: расписание + статистика мастера. Роль проверяет бот.
    // =====================================================================
    case 'panel_master_overview':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'days'      => $input['days'] ?? 30,
            'period'    => $input['period'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/master/overview');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 40,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: клиенты мастера на предстоящий день (тег + история + AI-совет)
    // =====================================================================
    case 'panel_master_day':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'date'         => $input['date'] ?? null,
            'staff_id'     => $input['staff_id'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/master/day');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 50,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    case 'panel_master_clients':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'staff_id'     => $input['staff_id'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/master/clients');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 55,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // GOD-режим: founder-кабинет MAYA. Право (только основатель) проверяет бот.
    // Пробрасываем весь body (action + поля), бот сам решает что делать.
    // =====================================================================
    case 'god_overview':
    case 'god_health':
    case 'god_billing':
    case 'god_subscribers':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        if ($action === 'god_billing' && (($input['action'] ?? 'view') !== 'view')) {
            http_response_code(410);
            echo json_encode([
                'ok' => false,
                'error' => 'god_billing_controls_retired',
                'business_mutations' => 0,
            ]);
            break;
        }
        $fwd = is_array($input) ? $input : [];
        $fwd['auth_data']     = $input['auth_data'] ?? null;
        $fwd['session_token'] = $input['session_token'] ?? null;
        $god_map = [
            'god_overview'    => '/api/god/overview',
            'god_health'      => '/api/god/health',
            'god_billing'     => '/api/god/billing',
            'god_subscribers' => '/api/god/subscribers',
        ];
        $god_headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Telegram-InitData: ' . $init_data,
        ];
        // B13 canonical read-only tenant projection: the SaaS bearer is the
        // platform authority; Telegram founder identity is not promoted.
        if ($action === 'god_subscribers') {
            $incoming_auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
            if (is_string($incoming_auth) && str_starts_with($incoming_auth, 'Bearer ')) {
                $god_headers[] = 'Authorization: ' . $incoming_auth;
            }
        }
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . $god_map[$action]);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($fwd),
            CURLOPT_HTTPHEADER     => $god_headers,
            CURLOPT_TIMEOUT        => 40,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: Owner Command Center. Только владелец; право проверяет бот.
    // =====================================================================
    case 'panel_command_center':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/command_center');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: ручной дневной план выручки Owner OS.
    // =====================================================================
    case 'panel_plan_target':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'target_rub' => $input['target_rub'] ?? ($input['daily_target_rub'] ?? 0),
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/plan_target');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: проверка результата action-card AI-директора.
    // =====================================================================
    case 'panel_action_evaluate':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'action_id' => $input['action_id'] ?? null,
            'force' => $input['force'] ?? false,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/action/evaluate');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: создать ручную контрольную задачу Owner OS.
    // =====================================================================
    case 'panel_control_create':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'title' => $input['title'] ?? '',
            'detail' => $input['detail'] ?? '',
            'priority' => $input['priority'] ?? 'medium',
            'due_at' => $input['due_at'] ?? null,
            'due_in_days' => $input['due_in_days'] ?? null,
            'potential_rub' => $input['potential_rub'] ?? null,
            'owner_next_step' => $input['owner_next_step'] ?? '',
            'signal_key' => $input['signal_key'] ?? '',
            'signal_kind' => $input['signal_kind'] ?? '',
            'signal_source' => $input['signal_source'] ?? '',
            'action_job' => $input['action_job'] ?? '',
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/control/create');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: безопасный автопилот Maya OS v2.
    // =====================================================================
    case 'panel_autonomy_tick':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'limit' => $input['limit'] ?? 5,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/autonomy/tick');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: контроль исполнения Autopilot 2.1.
    // =====================================================================
    case 'panel_autopilot_supervise':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'limit' => $input['limit'] ?? 8,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/autopilot/supervise');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: замкнутый цикл исполнения Maya OS v3.
    // =====================================================================
    case 'panel_execution_loop':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'limit' => $input['limit'] ?? 6,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/execution/loop');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ УПРАВЛЕНИЯ: lifecycle ручной контрольной задачи Owner OS.
    // =====================================================================
    case 'panel_control_update':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
            'task_id' => $input['task_id'] ?? ($input['action_id'] ?? null),
            'action' => $input['action'] ?? '',
            'note' => $input['note'] ?? '',
            'due_at' => $input['due_at'] ?? null,
            'due_in_days' => $input['due_in_days'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/control/update');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: погашение кода лояльности/сертификата. Право проверяет бот.
    // =====================================================================
    case 'panel_redeem':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'code'      => $input['code'] ?? '',
            'mode'      => $input['mode'] ?? 'lookup',
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/redeem');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: ручной запуск фоновой задачи (право проверяет бот).
    // =====================================================================
    case 'panel_job_run':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'job'       => $input['job'] ?? '',
            'title'     => $input['title'] ?? '',
            'source'    => $input['source'] ?? '',
            'source_control_id' => $input['source_control_id'] ?? null,
            'source_signal_key' => $input['source_signal_key'] ?? '',
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/job/run');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: сводка и последние отзывы (право проверяет бот).
    // =====================================================================
    case 'panel_reviews':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'days'      => $input['days'] ?? 90,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/reviews');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: конструктор рассылки (шаблоны / превью / отправка). Право — бот.
    // =====================================================================
    case 'panel_broadcast':
        require_once __DIR__ . '/package5-b35-bulk-proxy.php';
        maya_b35_bulk_proxy($input, $TG_CONFIG);
        break;

    // =====================================================================
    // ПАНЕЛЬ: команда (мастера, bind-коды, кассиры) + управляющие. Право — бот.
    // =====================================================================
    case 'panel_team':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'mode'      => $input['mode'] ?? 'list',
            'staff_id'  => $input['staff_id'] ?? null,
            'name'      => $input['name'] ?? '',
            'reset'     => $input['reset'] ?? false,
            'on'        => $input['on'] ?? false,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/team');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: список/добавление/удаление управляющих. Право — бот.
    // =====================================================================
    case 'panel_managers':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
            'mode'      => $input['mode'] ?? 'list',
            'tg_id'     => $input['tg_id'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/managers');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: разбивка по мастерам (выручка/визиты/рейтинг). Право — бот.
    // =====================================================================
    case 'panel_masters_stats':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null, 'days' => $input['days'] ?? 30, 'period' => $input['period'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/masters_stats');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    case 'panel_my_earnings':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/my_earnings');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    case 'panel_salary':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/salary');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: журнал записей за день (мастера колонками). Право/телефоны — бот.
    // =====================================================================
    case 'panel_journal':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null, 'date' => $input['date'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/journal');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: ручная запись клиента из журнала (только владелец). Право/телефон — бот.
    // =====================================================================
    case 'panel_journal_create':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'staff_id'     => $input['staff_id'] ?? null,
            'service_ids'  => $input['service_ids'] ?? [],
            'datetime'     => $input['datetime'] ?? null,
            'client_name'  => $input['client_name'] ?? null,
            'client_phone' => $input['client_phone'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/journal_create');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // Настроение визита (🔴 тишина / 🔵 общение): клиент выбрал пилюлю на
    // экране подтверждения записи. Прокидываем в бэкенд → visit_mood + comment.
    // =====================================================================
    // Ближайшее свободное окно по салону (тизер на кнопке «Записаться»). Публично.
    case 'nearest_slot':
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/nearest-slot');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['ok' => false, 'error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"ok":false}';
        break;

    case 'set_visit_mood':
        require_once __DIR__ . '/package5-client-consent-proxy.php';
        maya_client_consent_proxy($action, $input, $TG_CONFIG);
        break;

    // =====================================================================
    // ПАНЕЛЬ: подсказки клиентов по части телефона (ручная запись). Только владелец.
    // =====================================================================
    case 'panel_client_search':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'query'        => $input['query'] ?? '',
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/client_search');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПРОМО: клиент в баннере нажал «Записаться» → бот шлёт промокод −20%.
    // =====================================================================
    case 'promo_gift':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
        ]);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/promo_gift');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: лист ожидания — на какие занятые слоты есть спрос (владелец).
    // =====================================================================
    case 'panel_waitlist':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/waitlist');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: перенос записи из журнала (только владелец). Право — бот.
    // =====================================================================
    case 'panel_journal_reschedule':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'record_id'    => $input['record_id'] ?? null,
            'datetime'     => $input['datetime'] ?? null,
            'staff_id'     => $input['staff_id'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/journal_reschedule');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: отмена записи из журнала (только владелец). Право — бот.
    // =====================================================================
    case 'panel_journal_cancel':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'record_id'    => $input['record_id'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/journal_cancel');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // КОМАНДА: внутренний чат сотрудников — отправить / забрать сообщения. Роль — бот.
    // =====================================================================
	    case 'team_chat_send':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

	    case 'team_chat_fetch':
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'canonical_team_owner_required',
            'url' => 'https://malesthetic.pro/app/?team=main', 'business_mutations' => 0,
            'legacy_files_changed' => 0]);
        break;

    case 'panel_journal_attendance':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'record_id'    => $input['record_id'] ?? null,
            'attendance'   => $input['attendance'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/journal_attendance');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: карточка-чек визита (детали, оплата, добавить услугу). Право — бот.
    // =====================================================================
    case 'panel_journal_record':
    case 'panel_journal_pay':
    case 'panel_journal_add_service':
    case 'panel_journal_set_services':
    case 'panel_journal_set_client_name':
    case 'panel_journal_set_client_data':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'auth_data'    => $input['auth_data'] ?? null,
            'session_token'=> $input['session_token'] ?? null,
            'record_id'    => $input['record_id'] ?? null,
            'method'       => $input['method'] ?? null,
            'service_ids'  => $input['service_ids'] ?? null,
            'client_name'  => $input['client_name'] ?? ($input['name'] ?? null),
            'name'         => $input['name'] ?? ($input['client_name'] ?? null),
            'client_phone' => $input['client_phone'] ?? ($input['phone'] ?? null),
            'phone'        => $input['phone'] ?? ($input['client_phone'] ?? null),
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/' . substr($action, 6)); // strip "panel_"
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 30, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['error' => 'bot_unreachable']); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: PDF-отчёт (отправляется владельцу в Telegram). Право — бот.
    // =====================================================================
    case 'panel_report_pdf':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null, 'days' => $input['days'] ?? 30, 'period' => $input['period'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/report_pdf');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: реальная статистика по салону из YClients. Право — бот.
    // =====================================================================
    case 'panel_salon_stats':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null, 'days' => $input['days'] ?? 30, 'period' => $input['period'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/salon_stats');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 35,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // ПАНЕЛЬ: сегодняшние визиты по всему салону из YClients. Право — бот.
    // =====================================================================
    case 'panel_salon_today':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/panel/salon_today');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'bot_unreachable']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"success":false,"error":"empty_response"}';
        break;

    // =====================================================================
    // НОВОЕ: Чат с ассистентом в приложении — форвардим боту (/api/chat).
    // Авторизация: initData (Mini App) ИЛИ auth_data (PWA Login Widget) —
    // бот сам проверит подпись. Таймаут больше: ИИ может думать дольше.
    // =====================================================================
    case 'chat_history':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'mode' => (string)($input['mode'] ?? ''),
            'auth_data' => $input['auth_data'] ?? null,
            'session_token' => $input['session_token'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/chat/history');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['error' => 'bot_unreachable', 'message' => 'Нет связи с ассистентом. Попробуйте позже.']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    case 'chat_delete':
        // p5_b23_server_history_delete_retired: no identity, storage or upstream access.
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'FEATURE_NOT_AVAILABLE']);
        break;

    case 'chat':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'message'   => (string)($input['message'] ?? ''),
            'booking_confirmation' => $input['booking_confirmation'] ?? null,
            'mode'      => (string)($input['mode'] ?? ''),
            'audio'     => $input['audio'] ?? null,
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
        ]);
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/chat');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 90,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['error' => 'bot_unreachable', 'message' => 'Нет связи с ассистентом. Попробуйте позже.']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // Чат-стрим (SSE): прозрачно прокидываем поток событий бота клиенту,
    // чтобы первые слова появлялись через ~1с. Буферизацию рубим; если
    // хостинг всё равно буферит — поток просто придёт целиком в конце
    // (как старый /api/chat, без регресса). Жёсткий сбой → событие error,
    // фронт делает фолбэк на обычный action=chat.
    // =====================================================================
    case 'chat_stream':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'message'   => (string)($input['message'] ?? ''),
            'booking_confirmation' => $input['booking_confirmation'] ?? null,
            'mode'      => (string)($input['mode'] ?? ''),
            'audio'     => $input['audio'] ?? null,
            'voice'     => $input['voice'] ?? null,   // голосовой режим → озвучка по предложениям
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
        ]);
        // Прозрачная потоковая отдача: глушим любую буферизацию вывода
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', '0');
        @ini_set('implicit_flush', '1');
        while (ob_get_level() > 0) { @ob_end_flush(); }
        ob_implicit_flush(true);
        @set_time_limit(130);
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache, no-transform');
        header('X-Accel-Buffering: no'); // просим nginx не буферизовать
        $payload = maya_r02_staff_payload($payload, $input);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/chat/stream');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: text/event-stream',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 130,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) {
                echo $chunk;
                @flush();
                return strlen($chunk);
            },
        ]);
        curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            echo "data: " . json_encode(['type' => 'error', 'message' => 'bot_unreachable']) . "\n\n";
            @flush();
        }
        break;

    // =====================================================================
    // CutMatch снят с прод-контура по 152-ФЗ. Не форвардим фото/генерации даже
    // если старый UI или прямой клиент вызовет action.
    // =====================================================================
    case 'try_haircut':
    case 'haircut_status':
        http_response_code(404);
        echo json_encode(['error' => 'disabled', 'message' => 'CutMatch временно отключён.']);
        break;

    case 'me_photo':
        // Telegram-аватар вошедшего сотрудника (data-URI) для пилюли имени.
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode(['auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null]);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/me/photo');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-Telegram-InitData: ' . $init_data],
            CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) { http_response_code(502); echo json_encode(['photo' => null]); break; }
        http_response_code($status ?: 502);
        echo $body ?: '{"photo":null}';
        break;

    case 'analyze_face':
        http_response_code(404);
        echo json_encode(['error' => 'disabled', 'message' => 'CutMatch временно отключён.']);
        break;

    // =====================================================================
    // Согласия (152-ФЗ + ст.18 ФЗ «О рекламе») — статус и подпись.
    // Форвардим боту, авторизация — initData или auth_data (как у /api/chat).
    // =====================================================================
    case 'consent_status':
    case 'consent_submit':
    case 'client_link_consume':
        require_once __DIR__ . '/package5-client-consent-proxy.php';
        maya_client_consent_proxy($action, $input, $TG_CONFIG);
        break;

    // =====================================================================
    // Покупка подарочного сертификата картой прямо в приложении (ЮKassa).
    // Форвардим боту (/api/cert/create); авторизация — initData или auth_data.
    // Бот создаёт платёж и возвращает confirmation_url (страница оплаты ЮKassa).
    // =====================================================================
    case 'cert_create':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'amount'          => isset($input['amount']) ? (int)$input['amount'] : 0,
            'recipient_name'  => $input['recipient_name'] ?? null,
            'recipient_phone' => $input['recipient_phone'] ?? null,
            'auth_data'       => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
        ]);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/cert/create');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['error' => 'bot_unreachable', 'message' => 'Нет связи с сервером оплаты. Попробуйте позже.']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // Покупка абонемента картой прямо в приложении (ЮKassa).
    // Форвардим боту (/api/sub/create); авторизация — initData или auth_data.
    // =====================================================================
    case 'sub_create':
        $init_data = $_SERVER['HTTP_X_TELEGRAM_INITDATA'] ?? '';
        $payload = json_encode([
            'plan'      => $input['plan'] ?? null,
            'tier'      => $input['tier'] ?? null,
            'auth_data' => $input['auth_data'] ?? null, 'session_token' => $input['session_token'] ?? null,
        ]);
        $ch = curl_init($TG_CONFIG['bot_api_base'] . '/api/sub/create');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Telegram-InitData: ' . $init_data,
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            echo json_encode(['error' => 'bot_unreachable', 'message' => 'Нет связи с сервером оплаты. Попробуйте позже.']);
            break;
        }
        http_response_code($status ?: 502);
        echo $body ?: '{"error":"empty_response"}';
        break;

    // =====================================================================
    // PUSH: мастер разрешил уведомления в установленной PWA/APK.
    // Бот-сервер проверит роль и сохранит browser push-subscription.
    // =====================================================================
    case 'push_subscribe':
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

    case 'tip_sent':
        // p5_b22_unverified_tip_signal_retired: no upstream call or payload authority.
        http_response_code(410);
        echo json_encode(['ok' => false, 'error' => 'tip_signal_retired',
            'payment_confirmed' => false, 'external_payment_available' => true,
            'business_mutations' => 0]);
        break;

    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action: ' . $action, 'version' => 'v7_tgauth']);
        break;
}

// =============================================================================
// Валидация Telegram Login Widget
// https://core.telegram.org/widgets/login#checking-authorization
// =============================================================================
function tg_verify_login_widget(array $data, string $bot_token, int $max_age = 2592000): bool {
    if (empty($data['hash']) || empty($data['auth_date'])) return false;

    $received_hash = $data['hash'];
    $auth_date = (int)$data['auth_date'];

    // Проверка возраста (не старее max_age секунд)
    if ($auth_date <= 0 || (time() - $auth_date) > $max_age) return false;

    // Собираем data-check-string: все поля кроме hash, отсортированы по ключу, JOIN "\n"
    $check_data = $data;
    unset($check_data['hash']);
    ksort($check_data);
    $lines = [];
    foreach ($check_data as $k => $v) {
        // Telegram присылает примитивы — кастуем к строке
        $lines[] = $k . '=' . (is_bool($v) ? ($v ? 'true' : 'false') : (string)$v);
    }
    $data_check_string = implode("\n", $lines);

    // secret_key = SHA256(bot_token) — это ОТЛИЧАЕТСЯ от WebApp InitData (там HMAC)
    $secret_key = hash('sha256', $bot_token, true);
    $computed = hash_hmac('sha256', $data_check_string, $secret_key);

    return hash_equals($computed, $received_hash);
}

function normalize_phone($phone) {
    $phone = preg_replace('/\D+/', '', $phone);
    if (strlen($phone) === 11 && $phone[0] === '8') $phone = '7' . substr($phone, 1);
    if (strlen($phone) === 10) $phone = '7' . $phone;
    return $phone;
}

function yc_http_status($headers) {
    $status = 0;
    foreach (($headers ?: []) as $h) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', (string)$h, $m)) {
            $status = intval($m[1]);
        }
    }
    return $status;
}

function yc_should_retry($method, $status, $resp) {
    if ($method !== 'GET') return false; // POST записи не повторяем: риск дубля.
    if ($resp === false) return true;
    return $status === 429 || $status >= 500;
}

function yc_request($method, $url, $data = null, $user_token = '') {
    $body = $data === null ? null : json_encode($data);
    $auth = 'Bearer ' . PARTNER_TOKEN;
    if ($user_token) $auth .= ', User ' . $user_token;
    $headers = "Authorization: {$auth}\r\nAccept: application/vnd.yclients.v2+json\r\nContent-Type: application/json";
    if ($body !== null) {
        $headers .= "\r\nContent-Length: " . strlen($body);
    }
    $attempts = ($method === 'GET') ? 3 : 1;
    $last = ['success' => false, 'error' => 'request_failed', 'code' => 'yclients_unavailable'];

    for ($i = 0; $i < $attempts; $i++) {
        $http_response_header = [];
        $opts = ['http' => [
            'method'        => $method,
            'header'        => $headers,
            'ignore_errors' => true,
            'timeout'       => 15,
        ], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]];
        if ($body !== null) {
            $opts['http']['content'] = $body;
        }
        $resp = @file_get_contents($url, false, stream_context_create($opts));
        $status = yc_http_status($http_response_header ?? []);
        if ($resp === false) {
            $last = ['success' => false, 'error' => 'request_failed', 'code' => 'yclients_unavailable', 'http_status' => $status];
        } else {
            $decoded = json_decode($resp, true);
            if (is_array($decoded)) {
                $decoded['http_status'] = $status;
                if ($i + 1 < $attempts && yc_should_retry($method, $status, $resp)) {
                    $last = $decoded;
                    usleep(180000 * ($i + 1));
                    continue;
                }
                return $decoded;
            }
            $last = ['success' => false, 'error' => 'bad_json', 'code' => 'bad_yclients_response', 'http_status' => $status];
        }
        if ($i + 1 < $attempts && yc_should_retry($method, $status, $resp)) {
            usleep(180000 * ($i + 1));
            continue;
        }
        break;
    }
    return $last;
}

function yc_get($url) {
    return yc_request('GET', $url);
}

function yc_post($url, $data, $user_token = '') {
    return yc_request('POST', $url, $data, $user_token);
}

function yc_message($result) {
    if (!is_array($result)) return '';
    if (!empty($result['message'])) return (string)$result['message'];
    if (!empty($result['error'])) return (string)$result['error'];
    if (!empty($result['meta']) && is_array($result['meta'])) {
        if (!empty($result['meta']['message'])) return (string)$result['meta']['message'];
        if (!empty($result['meta']['error'])) return (string)$result['meta']['error'];
    }
    return '';
}

function booking_error_response($result) {
    $raw = yc_message($result);
    $low = function_exists('mb_strtolower') ? mb_strtolower($raw ?: '', 'UTF-8') : strtolower($raw ?: '');
    $code = 'booking_failed';
    $message = 'Не удалось создать запись. Попробуйте другое время или напишите Майе.';
    $status = intval($result['http_status'] ?? 0);

    if (($result['code'] ?? '') === 'yclients_unavailable' || $status === 429 || $status >= 500 ||
        strpos($low, 'timeout') !== false || strpos($low, 'timed out') !== false ||
        strpos($low, 'request_failed') !== false) {
        $code = 'yclients_unavailable';
        $message = 'Сервер записи временно отвечает нестабильно. Проверьте запись чуть позже или напишите Майе.';
    } elseif (strpos($low, 'busy') !== false || strpos($low, 'занят') !== false ||
        strpos($low, 'недоступ') !== false || strpos($low, 'not available') !== false ||
        strpos($low, 'slot') !== false || strpos($low, 'seance') !== false) {
        $code = 'slot_taken';
        $message = 'Это время уже заняли или оно стало недоступно. Выберите другой слот.';
    } elseif (strpos($low, 'phone') !== false || strpos($low, 'телефон') !== false) {
        $code = 'bad_phone';
        $message = 'Проверьте номер телефона и попробуйте ещё раз.';
    } elseif (strpos($low, 'name') !== false || strpos($low, 'имя') !== false || strpos($low, 'fullname') !== false) {
        $code = 'bad_name';
        $message = 'Проверьте имя и попробуйте ещё раз.';
    } elseif (strpos($low, 'service') !== false || strpos($low, 'услуг') !== false) {
        $code = 'bad_service';
        $message = 'Услуга стала недоступна. Вернитесь к выбору услуги и попробуйте снова.';
    } elseif (strpos($low, 'staff') !== false || strpos($low, 'master') !== false || strpos($low, 'мастер') !== false) {
        $code = 'bad_staff';
        $message = 'Мастер сейчас недоступен для записи. Выберите другого мастера или время.';
    }

    return ['success' => false, 'error' => $message, 'message' => $message, 'code' => $code];
}
