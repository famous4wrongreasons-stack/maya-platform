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
