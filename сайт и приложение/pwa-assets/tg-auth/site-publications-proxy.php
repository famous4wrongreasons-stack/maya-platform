<?php
// Called after api-proxy.php's origin/rate checks. No credentials here.
function forward_site_publication($action, $backendBase) {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
        http_response_code(405);
        header('Allow: GET, HEAD');
        return;
    }
    $path = '/api/site/posts';
    if ($action === 'site_post_list') {
        $path .= '?' . http_build_query([
            'limit' => max(1, min(30, (int)($_GET['limit'] ?? 12))),
            'offset' => max(0, min(100000, (int)($_GET['offset'] ?? 0))),
        ]);
    } elseif ($action === 'site_post') {
        $slug = (string)($_GET['slug'] ?? '');
        if (!preg_match('/^post-[a-f0-9]{32}$/D', $slug)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'not_found']);
            return;
        }
        $path .= '/' . $slug;
    } elseif ($action === 'site_post_media') {
        $file = (string)($_GET['file'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}\.(jpg|mp4)$/D', $file)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'not_found']);
            return;
        }
        $path = '/api/site/post-media/' . $file;
    } else {
        http_response_code(400);
        return;
    }
    $curl = curl_init(rtrim($backendBase, '/') . $path);
    curl_setopt_array($curl, [CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 120]);
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') curl_setopt($curl, CURLOPT_NOBODY, true);
    if ($action === 'site_post_media') {
        $range = (string)($_SERVER['HTTP_RANGE'] ?? '');
        if (preg_match('/^bytes=\d*-\d*$/D', $range)) {
            curl_setopt($curl, CURLOPT_HTTPHEADER, ['Range: ' . $range]);
        }
        curl_setopt($curl, CURLOPT_HEADERFUNCTION, function ($handle, $line) {
            if (preg_match('/^HTTP\/\S+\s+(\d+)/', $line, $matches)) {
                http_response_code((int)$matches[1]);
            } elseif (preg_match('/^(Content-Type|Content-Length|Content-Range|Accept-Ranges|ETag|Last-Modified|Cache-Control):/i', $line)) {
                header(trim($line));
            }
            return strlen($line);
        });
        header('X-Content-Type-Options: nosniff');
        $sent = false;
        curl_setopt($curl, CURLOPT_WRITEFUNCTION, function ($handle, $chunk) use (&$sent) {
            $sent = true;
            echo $chunk;
            return strlen($chunk);
        });
        $ok = curl_exec($curl);
        if ($ok === false && !$sent) {
            http_response_code(502);
            echo json_encode(['ok' => false, 'error' => 'media_unavailable']);
        }
    } else {
        curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
        $result = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        header('Cache-Control: no-store');
        http_response_code($status >= 200 && $status <= 599 ? $status : 502);
        echo $result !== false ? $result : json_encode(['ok' => false, 'error' => 'feed_unavailable']);
    }
    curl_close($curl);
}
