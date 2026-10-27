<?php
// Streams one stored PDF to a logged-in team member (decrypts it on the way out).
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();
$id = (int)($_GET['id'] ?? 0);
$s = $pdo->prepare('SELECT * FROM client_files WHERE id = ? AND deleted_at IS NULL');
$s->execute([$id]);
$f = $s->fetch(PDO::FETCH_ASSOC);
$path = $f ? private_path('files') . '/' . basename($f['stored_name']) : '';
if (!$f || !is_file($path)) { http_response_code(404); exit('File not found.'); }
$raw = (string)file_get_contents($path);
$data = $f['enc'] ? file_decrypt_bytes($raw) : $raw;
if ($data === false) { http_response_code(500); exit('This file cannot be decrypted on this server.'); }
audit('file opened', $f['name'] . ' (#' . $id . ')');
$name = str_replace(['"', "\r", "\n", '\\'], '_', $f['name']);
header_remove('Content-Security-Policy');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:");
header('Content-Type: application/pdf');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
header('Content-Disposition: ' . (isset($_GET['dl']) ? 'attachment' : 'inline') . '; filename="' . $name . '"; filename*=UTF-8\'\'' . rawurlencode($f['name']));
header('Content-Length: ' . strlen($data));
echo $data;
