<?php
require_once __DIR__ . '/db.php';

const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';
const SESSION_IDLE_SECONDS = 28800; // 8 hours

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('lmh_dash');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/dashboard/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'");

// ---------- helpers ----------
function e($v) {
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

function money($v) {
    return 'Rs. ' . number_format((float)$v);
}

function current_user() {
    return $_SESSION['user'] ?? null;
}

function csrf_token() {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field() {
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_check() {
    $ok = isset($_POST['csrf'], $_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$_POST['csrf']);
    if (!$ok) {
        http_response_code(400);
        exit('Session expired. Go back, refresh the page and try again.');
    }
}

function require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        exit('Method not allowed');
    }
    csrf_check();
}

function flash($msg, $type = 'ok') {
    $_SESSION['flash'] = ['m' => $msg, 't' => $type];
}

function take_flash() {
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}

function redirect($url) {
    header('Location: ' . $url);
    exit;
}

function require_login() {
    $u = current_user();
    if (!$u) {
        redirect('/dashboard/login.php');
    }
    if (time() - ($_SESSION['last_seen'] ?? 0) > SESSION_IDLE_SECONDS) {
        $_SESSION = [];
        session_destroy();
        redirect('/dashboard/login.php');
    }
    $_SESSION['last_seen'] = time();
    // Force a new password while the built-in default is still active
    if (!empty($_SESSION['default_pw']) && basename($_SERVER['SCRIPT_NAME']) !== 'change_password.php'
        && basename($_SERVER['SCRIPT_NAME']) !== 'logout.php') {
        redirect('/dashboard/change_password.php');
    }
}

function ensure_default_admin() {
    $pdo = get_db();
    $count = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($count == 0) {
        // First run only. The first login is forced to set a new password.
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        $stmt->execute(['admin', password_hash(DEFAULT_ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    }
}

// ---------- brute-force throttle ----------
function client_ip() {
    return substr($_SERVER['REMOTE_ADDR'] ?? 'unknown', 0, 64);
}

function login_blocked($username) {
    $pdo = get_db();
    $since = time() - 900;
    $pdo->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([$since]);
    $a = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ?');
    $a->execute([client_ip()]);
    $b = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE username = ?');
    $b->execute([strtolower($username)]);
    return $a->fetchColumn() >= 8 || $b->fetchColumn() >= 5;
}

function login_failed($username) {
    get_db()->prepare('INSERT INTO login_attempts (ip, username, ts) VALUES (?,?,?)')
        ->execute([client_ip(), strtolower($username), time()]);
}

function login_success($user) {
    session_regenerate_id(true);
    $_SESSION['user'] = ['id' => $user['id'], 'username' => $user['username']];
    $_SESSION['last_seen'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['default_pw'] = password_verify(DEFAULT_ADMIN_PASSWORD, $user['password_hash']);
    get_db()->prepare('DELETE FROM login_attempts WHERE username = ?')->execute([strtolower($user['username'])]);
}

// ---------- CRM helpers ----------
const STAGES = ['lead' => 'Lead', 'active' => 'Active', 'completed' => 'Completed', 'lost' => 'Lost'];
const FILE_TYPES = ['Midterm Files', 'Finalterm Files', 'Notes', 'FYP / GDB', 'LMS Handling', 'Other'];
const ACTIVITY_KINDS = ['note' => 'Note', 'call' => 'Call', 'whatsapp' => 'WhatsApp', 'payment' => 'Payment'];

function wa_number($raw) {
    $d = preg_replace('/\D/', '', (string)$raw);
    if ($d === '') return '';
    if (strpos($d, '00') === 0) $d = substr($d, 2);
    if (strpos($d, '0') === 0) $d = '92' . substr($d, 1);
    return $d;
}

function valid_date($d) {
    return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4));
}
