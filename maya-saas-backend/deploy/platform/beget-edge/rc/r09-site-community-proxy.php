<?php
// Loaded by the existing proxy after its origin/rate checks. No new bot or keys.
function forward_site_community(string $action, array $input, array $config): void {
    $routes = [
        'site_event_status' => 'status', 'site_event_view' => 'view',
        'site_event_like' => 'like', 'site_event_comment' => 'comment',
        'site_guest_chat' => 'guest-chat', 'site_event_moderation' => 'moderation',
        'site_event_resolve' => 'resolve',
    ];
    if (!isset($routes[$action]) || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
        return;
    }
    $secret = (string)($config['bot_token'] ?? '');
    if ($secret === '') {
        http_response_code(503);
        echo json_encode(['ok' => false, 'error' => 'unavailable']);
        return;
    }
    $cookie = (string)($_COOKIE['me_visitor'] ?? '');
    $parts = explode('.', $cookie);
    $valid = count($parts) === 3 && ctype_digit($parts[0])
        && preg_match('/^[a-f0-9]{64}$/D', $parts[1])
        && (int)$parts[0] <= time() && (int)$parts[0] > time() - 86400 * 180
        && hash_equals(hash_hmac('sha256', 'site-cookie-v1:' . $parts[0] . ':' . $parts[1], $secret), $parts[2]);
    if (!$valid) {
        $parts = [(string)time(), bin2hex(random_bytes(32))];
        $cookie = implode('.', $parts) . '.' . hash_hmac('sha256', 'site-cookie-v1:' . $parts[0] . ':' . $parts[1], $secret);
        $local = preg_match('#^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$#', $_SERVER['HTTP_ORIGIN'] ?? '');
        setcookie('me_visitor', $cookie, ['expires' => time() + 86400 * 180, 'path' => '/',
            'secure' => !$local, 'httponly' => true, 'samesite' => 'Lax']);
    }
    $payload = array_intersect_key($input, array_flip([
        'slug', 'text', 'display_name', 'auth_data', 'session_token', 'liked',
        'consent', 'form_token', 'request_key', 'website', 'message', 'guest_token',
        'comment_id', 'decision', 'expected_version', 'consent_policy_version',
    ]));
    // Bind the signed payload to the exact allowlisted route, including retries.
    $payload['gateway_action'] = $routes[$action];
    $payload['visitor'] = hash_hmac('sha256', 'site-visitor:' . $parts[1], $secret);
    // Never trust an IP or identity supplied by the browser or X-Forwarded-For.
    $payload['network'] = hash_hmac('sha256', 'site-network:' . ($_SERVER['REMOTE_ADDR'] ?? ''), $secret);
    $raw = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $stamp = (string)time();
    $curl = curl_init(rtrim($config['bot_api_base'], '/') . '/api/site/community/' . $routes[$action]);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $raw,
        CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 55,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json',
            'X-Site-Time: ' . $stamp,
            'X-Site-Signature: ' . hash_hmac('sha256', 'site-gateway-v1:' . $stamp . ':' . $raw, $secret)],
    ]);
    $result = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    header('Cache-Control: no-store');
    http_response_code($status >= 200 && $status <= 599 ? $status : 502);
    echo $result !== false ? $result : json_encode(['ok' => false, 'error' => 'service_unreachable']);
}
