<?php
// Serves the dashboard's own styling, scripts and app manifest through the same hidden-mode gate as the pages,
// so a stranger gets "404 Not Found" for these files too. Apache sends /dashboard/assets/*, manifest.webmanifest
// and sw.js here (see .htaccess). Nothing else can be read through this file.
require_once __DIR__ . '/includes/secure.php';
gate_enforce();

$want = (string)($_GET['f'] ?? '');
$allowed = ['manifest.webmanifest' => 'application/manifest+json', 'sw.js' => 'text/javascript; charset=utf-8'];
$types = ['css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'png' => 'image/png', 'svg' => 'image/svg+xml', 'webp' => 'image/webp'];

$file = null; $type = null;
if (isset($allowed[$want])) {
    $file = __DIR__ . '/' . $want;
    $type = $allowed[$want];
} elseif (preg_match('#^assets/([A-Za-z0-9._-]+)$#', $want, $m) && strpos($m[1], '..') === false) {
    $ext = strtolower(pathinfo($m[1], PATHINFO_EXTENSION));
    if (isset($types[$ext])) { $file = __DIR__ . '/assets/' . $m[1]; $type = $types[$ext]; }
}
if ($file === null || !is_file($file)) { http_response_code(404); header('Content-Type: text/plain; charset=UTF-8'); echo 'Not Found'; exit; }

$mtime = (int)filemtime($file);
$etag = '"' . $mtime . '-' . filesize($file) . '"';
header('Content-Type: ' . $type);
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, max-age=86400');
header('ETag: ' . $etag);
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
header('Content-Length: ' . filesize($file));
readfile($file);
