<?php

// Fixed upstream: this relay must never become a user-controlled open proxy.
const MAYA_PLATFORM_UPSTREAM = 'https://maya.111.88.148.206.nip.io/api';

$allowedOrigins = [
    'https://mayaos.ru',
    'https://www.mayaos.ru',
    'capacitor://localhost',
    'capacitor://mayaos.ru',
];
$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
if (in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, If-None-Match, X-Session-Token, X-Telegram-InitData');
header('Access-Control-Expose-Headers: Content-Type, ETag, Last-Modified, Location, Retry-After');

$method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET');
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
if (!in_array($method, $allowedMethods, true)) {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$path = isset($_SERVER['PATH_INFO']) ? (string) $_SERVER['PATH_INFO'] : '';
if ($path === '' || $path === '/') {
    $path = '/health';
}
if ($path[0] !== '/') {
    $path = '/' . $path;
}
if (strpos($path, "\0") !== false || preg_match('~(?:^|/)\.\.(?:/|$)~', $path)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => 'Invalid path'], JSON_UNESCAPED_UNICODE);
    exit;
}

$query = isset($_SERVER['QUERY_STRING']) ? (string) $_SERVER['QUERY_STRING'] : '';
$upstreamUrl = MAYA_PLATFORM_UPSTREAM . $path . ($query !== '' ? '?' . $query : '');

$requestHeaders = function_exists('getallheaders') ? getallheaders() : [];
$headerValue = static function ($headers, $name) {
    foreach ($headers as $key => $value) {
        if (strcasecmp((string) $key, $name) === 0) {
            return is_array($value) ? implode(', ', $value) : (string) $value;
        }
    }
    return null;
};

$authorization = $headerValue($requestHeaders, 'Authorization');
if ($authorization === null && isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $authorization = $_SERVER['HTTP_AUTHORIZATION'];
}
if ($authorization === null && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authorization = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}

$forwardHeaders = ['Accept: application/json'];
foreach (['Content-Type', 'If-None-Match', 'X-Session-Token', 'X-Telegram-InitData'] as $name) {
    $value = $headerValue($requestHeaders, $name);
    if ($value !== null && $value !== '') {
        $forwardHeaders[] = $name . ': ' . $value;
    }
}
if (is_string($authorization) && $authorization !== '') {
    $forwardHeaders[] = 'Authorization: ' . $authorization;
}

$responseHeaders = [];
$ch = curl_init($upstreamUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $forwardHeaders,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 12,
    CURLOPT_TIMEOUT => 75,
    CURLOPT_ENCODING => '',
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_USERAGENT => 'MAYA-Platform-Edge/1.0',
    CURLOPT_HEADERFUNCTION => static function ($curl, $line) use (&$responseHeaders) {
        $length = strlen($line);
        $separator = strpos($line, ':');
        if ($separator !== false) {
            $name = strtolower(trim(substr($line, 0, $separator)));
            $value = trim(substr($line, $separator + 1));
            $responseHeaders[$name] = $value;
        }
        return $length;
    },
]);

if ($method === 'HEAD') {
    curl_setopt($ch, CURLOPT_NOBODY, true);
} elseif ($method !== 'GET') {
    $body = file_get_contents('php://input');
    if ($body !== false && $body !== '') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
}

$responseBody = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($responseBody === false || $status === 0) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => 'MAYA server is temporarily unavailable'], JSON_UNESCAPED_UNICODE);
    error_log('MAYA platform edge upstream error: ' . $curlError);
    exit;
}

http_response_code($status);
foreach ([
    'content-type' => 'Content-Type',
    'etag' => 'ETag',
    'last-modified' => 'Last-Modified',
    'location' => 'Location',
    'retry-after' => 'Retry-After',
    'cache-control' => 'Cache-Control',
] as $source => $target) {
    if (isset($responseHeaders[$source]) && $responseHeaders[$source] !== '') {
        header($target . ': ' . $responseHeaders[$source]);
    }
}

if ($method !== 'HEAD' && $status !== 304) {
    echo $responseBody;
}
