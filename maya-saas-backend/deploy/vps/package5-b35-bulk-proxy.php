<?php
// B35 transport only: preserve the reviewed identity and canonical owner bearer.
function maya_b35_bulk_request(array $input, array $server): array {
    $mode = $input['mode'] ?? '';
    if (!is_string($mode)) throw new InvalidArgumentException('B35_INVALID_REQUEST');
    $fields = ['templates' => ['mode'], 'preview' => ['mode','bulkIdentity','text'],
               'confirm' => ['mode','campaignId','intentHash'], 'resume' => ['mode','campaignId','intentHash'],
               'status' => ['mode','campaignId']];
    if (!isset($fields[$mode]) || array_diff(array_keys($input), $fields[$mode])) throw new InvalidArgumentException('B35_INVALID_REQUEST');
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    $bearer = $server['HTTP_AUTHORIZATION'] ?? '';
    if ($mode !== 'templates') {
        if (!is_string($bearer) || strpos($bearer, 'Bearer ') !== 0 || strpbrk($bearer, "\r\n") !== false) throw new InvalidArgumentException('B35_CANONICAL_OWNER_SESSION_REQUIRED');
        $headers[] = 'Authorization: ' . $bearer;
    }
    return [json_encode((object)$input, JSON_THROW_ON_ERROR), $headers];
}
function maya_b35_bulk_proxy(array $input, array $config): void {
    try { [$payload, $headers] = maya_b35_bulk_request($input, $_SERVER); }
    catch (InvalidArgumentException $e) { http_response_code(400); echo '{"error":"B35_INVALID_REQUEST"}'; return; }
    $ch = curl_init($config['bot_api_base'] . '/api/panel/broadcast');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 35, CURLOPT_CONNECTTIMEOUT => 5]);
    $body = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); $error = curl_errno($ch); curl_close($ch);
    if ($error) { http_response_code(503); echo '{"error":"B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN"}'; return; }
    http_response_code($status ?: 503); echo $body ?: '{"error":"B35_OUTCOME_UNKNOWN_RESUME_SAME_CAMPAIGN"}';
}
