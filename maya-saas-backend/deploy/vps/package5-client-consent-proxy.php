<?php
// A18 transport only. Authentication and Client authority are checked by Maya.
function maya_client_consent_request(string $action, array $input, array $server): array {
    $routes = [
        'consent_status' => ['/api/consent/status', ['auth_data', 'session_token']],
        'consent_submit' => ['/api/consent/submit', ['auth_data', 'session_token', 'accept_pdn', 'accept_marketing', 'idempotency_key']],
        'client_link_consume' => ['/api/client-link/consume', ['auth_data', 'session_token', 'token']],
    ];
    if (!isset($routes[$action])) throw new InvalidArgumentException('invalid_client_command');
    [$path, $allowed] = $routes[$action];
    if (array_diff(array_keys($input), $allowed)) throw new InvalidArgumentException('invalid_client_command');
    if ($action === 'consent_submit' && (!is_bool($input['accept_pdn'] ?? null) || !is_bool($input['accept_marketing'] ?? null) || !is_string($input['idempotency_key'] ?? null)))
        throw new InvalidArgumentException('explicit_consent_decisions_required');
    if ($action === 'client_link_consume' && !is_string($input['token'] ?? null)) throw new InvalidArgumentException('challenge_required');
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    foreach (['HTTP_X_TELEGRAM_INITDATA' => 'X-Telegram-InitData', 'HTTP_AUTHORIZATION' => 'Authorization'] as $key => $name) {
        $value = $server[$key] ?? '';
        if ($value !== '') {
            if (!is_string($value) || strpbrk($value, "\r\n") !== false) throw new InvalidArgumentException('invalid_channel_header');
            $headers[] = $name . ': ' . $value;
        }
    }
    return [$path, json_encode((object)$input, JSON_THROW_ON_ERROR), $headers];
}
function maya_client_consent_proxy(string $action, array $input, array $config): void {
    try { [$path, $payload, $headers] = maya_client_consent_request($action, $input, $_SERVER); }
    catch (InvalidArgumentException $e) { http_response_code(400); echo '{"error":"invalid_client_command"}'; return; }
    $ch = curl_init($config['bot_api_base'] . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 5]);
    $body = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); $error = curl_error($ch); curl_close($ch);
    if ($error) { http_response_code(502); echo '{"error":"bot_unreachable"}'; return; }
    http_response_code($status ?: 502); echo $body ?: '{"error":"empty_response"}';
}
