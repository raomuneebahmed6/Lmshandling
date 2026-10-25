<?php
require_once __DIR__ . '/db.php';

const SESSION_IDLE_SECONDS = 7200;   // 2 hours without activity logs you out
const SESSION_MAX_SECONDS = 43200;   // 12 hours is the longest a login lasts

// never show PHP errors to visitors (they can reveal file paths); log them privately instead
ini_set('display_errors', '0');
ini_set('log_errors', '1');
@ini_set('error_log', private_path('php-errors.log'));
set_exception_handler(function ($ex) {
    error_log('Uncaught: ' . $ex->getMessage() . ' in ' . $ex->getFile() . ':' . $ex->getLine());
    if (!headers_sent()) http_response_code(500);
    echo 'Something went wrong. Please try again, or contact the site owner.';
});

$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
date_default_timezone_set('Asia/Karachi');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.gc_maxlifetime', (string)SESSION_MAX_SECONDS);
$sessDir = private_path('sessions');
if (!is_dir($sessDir)) @mkdir($sessDir, 0700, true);
if (is_dir($sessDir) && is_writable($sessDir)) session_save_path($sessDir);
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
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Resource-Policy: same-origin');
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

function is_admin() {
    $u = current_user();
    return $u && ($u['role'] ?? 'admin') === 'admin';
}

function require_admin() {
    require_login();
    if (!is_admin()) {
        http_response_code(403);
        exit('This section is for the admin account only.');
    }
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
        redirect('/dashboard/login');
    }
    $now = time();
    $fp = hash('sha256', ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|lmh');
    if ($now - ($_SESSION['last_seen'] ?? 0) > SESSION_IDLE_SECONDS || $now - ($_SESSION['born'] ?? 0) > SESSION_MAX_SECONDS
        || !hash_equals($_SESSION['fp'] ?? '', $fp)) {
        $_SESSION = [];
        session_destroy();
        redirect('/dashboard/login');
    }
    $_SESSION['last_seen'] = $now;
    // renew the session id every 15 minutes
    if ($now - ($_SESSION['rotated'] ?? 0) > 900) { session_regenerate_id(true); $_SESSION['rotated'] = $now; }
    $script = basename($_SERVER['SCRIPT_NAME']);
    // a new or reset password must be replaced before anything else
    if (!empty($_SESSION['default_pw']) && $script !== 'change_password.php' && $script !== 'logout.php') {
        redirect('/dashboard/change_password');
    }
    // everyone must use two-step login (the admin can switch this off in Settings)
    if (two_factor_required() && empty($_SESSION['has2fa']) && $script !== 'change_password.php' && $script !== 'logout.php') {
        flash('Turn on two-step login to continue. It protects the students\' data even if a password leaks.', 'warn');
        redirect('/dashboard/change_password#twofa');
    }
}

function two_factor_required() {
    if (getenv('LMH_REQUIRE_2FA') === '0') return false; // used only by automated tests
    return settings_get('require_2fa', '1') !== '0';
}

// returns an error message when a new password is too weak, or '' when it is acceptable
function weak_password($pw, $username = '') {
    $pw = (string)$pw;
    if (strlen($pw) < 10) return 'Password must be at least 10 characters.';
    $l = strtolower($pw);
    $common = ['password', 'passw0rd', 'qwerty', 'qwertyuiop', 'letmein', '123456789', '1234567890', '0987654321', 'iloveyou', 'welcome', 'admin', 'changeme', 'academic', 'virtual', 'lmshandling', 'nibaha', 'islamabad', 'pakistan', 'abcdefgh', 'asdfghjk', 'zxcvbnm'];
    foreach ($common as $c) if (strpos($l, $c) !== false) return 'That password is too easy to guess. Avoid common words, names and "admin", "password", "academic".';
    if ($username !== '' && stripos($pw, $username) !== false) return 'The password must not contain your username.';
    if (preg_match('/^(.)\1+$/', $pw) || preg_match('/^(?:0123456789|1234567890|abcdefghij)/i', $pw)) return 'That password is a simple pattern. Use something longer and mixed.';
    if (strlen(count_chars($pw, 3)) < 6) return 'Use more different characters.';
    // four letters or digits in a row (1234, abcd, 9876) make a password easy to guess
    $n = strlen($l);
    for ($i = 0; $i + 3 < $n; $i++) {
        $d = ord($l[$i + 1]) - ord($l[$i]);
        if (($d === 1 || $d === -1) && ctype_alnum(substr($l, $i, 4)) && ord($l[$i + 2]) - ord($l[$i + 1]) === $d && ord($l[$i + 3]) - ord($l[$i + 2]) === $d) {
            return 'Avoid runs like 1234 or abcd in a password.';
        }
    }
    return '';
}

function ensure_default_admin() {
    $pdo = get_db();
    // Emergency reset: create an empty file named reset-admin.flag in the private folder (hosting File Manager).
    // The next visit resets the admin account, clears its 2-step login and issues a new setup code.
    $flag = private_path('reset-admin.flag');
    if (is_file($flag)) {
        @unlink($flag);
        if (reset_admin_account()) { try { audit('admin reset', 'via reset-admin.flag'); } catch (Throwable $e) {} }
    }
    $count = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($count === 0) {
        // First run only. For real use the account gets a random unknown password and is claimed with a setup code.
        // Automated tests may set LMH_TEST_DEFAULT_ADMIN=1 to start with a known starting password instead.
        $test = getenv('LMH_TEST_DEFAULT_ADMIN') === '1';
        $pw = $test ? LEGACY_DEFAULT_PASSWORD : bin2hex(random_bytes(16));
        $pdo->prepare("INSERT INTO users (username, password_hash, role, must_change) VALUES (?, ?, 'admin', 1)")
            ->execute(['admin', password_hash($pw, PASSWORD_DEFAULT)]);
        if (!$test) issue_setup_code();
    }
}

// ---------- brute-force throttle + login history ----------
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

function log_login($uid, $username, $ok, $note = '') {
    $pdo = get_db();
    $pdo->prepare('INSERT INTO login_log (user_id, username, ip, agent, ok, note, ts) VALUES (?,?,?,?,?,?,?)')
        ->execute([$uid, substr((string)$username, 0, 60), client_ip(), substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 160), $ok ? 1 : 0, $note, time()]);
    $pdo->exec('DELETE FROM login_log WHERE ts < ' . (time() - 90 * 86400));
}

function login_success($user) {
    session_regenerate_id(true);
    $_SESSION['user'] = ['id' => (int)$user['id'], 'username' => $user['username'], 'role' => $user['role'] ?? 'admin'];
    unset($_SESSION['pending_2fa']);
    $_SESSION['last_seen'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['default_pw'] = !empty($user['must_change']);
    $_SESSION['has2fa'] = !empty($user['totp_enabled']);
    $_SESSION['born'] = time();
    $_SESSION['rotated'] = time();
    $_SESSION['fp'] = hash('sha256', ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|lmh');
    get_db()->prepare('DELETE FROM login_attempts WHERE username = ?')->execute([strtolower($user['username'])]);
    // tell the owner when someone signs in from an address not seen in the last 60 days
    $seen = get_db()->prepare('SELECT COUNT(*) FROM login_log WHERE ok = 1 AND ip = ? AND user_id = ? AND ts > ?');
    $seen->execute([client_ip(), $user['id'], time() - 60 * 86400]);
    $newIp = !$seen->fetchColumn();
    log_login($user['id'], $user['username'], true, $newIp ? 'new address' : '');
    if ($newIp) {
        $to = settings_get('summary_email') ?: 'nibahahaqvu1@gmail.com';
        @mail($to, 'Dashboard login from a new address', "Account: {$user['username']}\nAddress: " . client_ip() . "\nTime: " . date('Y-m-d H:i') . "\nDevice: " . substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 120) . "\n\nIf this was not you, open Security > Recent logins, change your password and turn on two-step login.", "From: Nibaha Haq CRM <no-reply@lmshandling.com>\r\nContent-Type: text/plain; charset=UTF-8");
    }
}

// ---------- two-factor authentication (TOTP, RFC 6238; works with Google Authenticator and similar apps) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32_encode($bin) {
    $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= B32[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function b32_decode($s) {
    $s = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $s));
    $bits = '';
    foreach (str_split($s) as $c) $bits .= str_pad(decbin(strpos(B32, $c)), 5, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}

function totp_new_secret() {
    return b32_encode(random_bytes(20));
}

function totp_code($secret, $counter) {
    $hash = hash_hmac('sha1', pack('N*', 0, $counter), b32_decode($secret), true);
    $o = ord($hash[19]) & 0xf;
    $n = ((ord($hash[$o]) & 0x7f) << 24) | ((ord($hash[$o + 1]) & 0xff) << 16) | ((ord($hash[$o + 2]) & 0xff) << 8) | (ord($hash[$o + 3]) & 0xff);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

// returns the accepted time-step counter (so it can be stored against replay) or false
function totp_verify($secret, $code, $afterCounter = 0) {
    $code = preg_replace('/\D/', '', (string)$code);
    if (strlen($code) !== 6) return false;
    $now = (int)floor(time() / 30);
    for ($i = -1; $i <= 1; $i++) {
        $c = $now + $i;
        if ($c > $afterCounter && hash_equals(totp_code($secret, $c), $code)) return $c;
    }
    return false;
}

function totp_uri($secret, $username) {
    return 'otpauth://totp/' . rawurlencode('Nibaha Haq CRM:' . $username) . '?secret=' . $secret . '&issuer=' . rawurlencode('Nibaha Haq CRM') . '&digits=6&period=30';
}

function new_recovery_codes() {
    $plain = []; $hashed = [];
    for ($i = 0; $i < 8; $i++) {
        $c = strtolower(bin2hex(random_bytes(3)) . '-' . bin2hex(random_bytes(3)));
        $plain[] = $c; $hashed[] = password_hash($c, PASSWORD_DEFAULT);
    }
    return [$plain, $hashed];
}

// checks an authenticator code or a one-time recovery code for this user row; true when accepted
function second_factor_ok($user, $input) {
    $pdo = get_db();
    $input = trim((string)$input);
    $c = totp_verify($user['totp_secret'], $input, (int)settings_get('totp_last_' . $user['id'], 0));
    if ($c !== false) {
        settings_set('totp_last_' . $user['id'], $c);
        return true;
    }
    $codes = json_decode((string)$user['recovery_codes'], true) ?: [];
    foreach ($codes as $i => $h) {
        if (password_verify(strtolower($input), $h)) {
            unset($codes[$i]);
            $pdo->prepare('UPDATE users SET recovery_codes = ? WHERE id = ?')->execute([json_encode(array_values($codes)), $user['id']]);
            return true;
        }
    }
    return false;
}

// ---------- CRM helpers ----------
const STAGES = ['lead' => 'Lead', 'active' => 'Active', 'completed' => 'Completed', 'lost' => 'Lost'];
const FILE_TYPES = ['Midterm Files', 'Finalterm Files', 'Notes', 'FYP / GDB', 'LMS Handling', 'Other'];
const ACTIVITY_KINDS = ['note' => 'Note', 'call' => 'Call', 'whatsapp' => 'WhatsApp', 'payment' => 'Payment'];
const ORDER_STATUSES = ['pending' => 'Pending', 'preparing' => 'Preparing', 'sent' => 'Sent', 'completed' => 'Completed'];
const PAY_METHODS = ['Cash', 'JazzCash', 'Easypaisa', 'Bank transfer', 'Other'];

// owed on one order row: never negative
const OWED_SQL = 'MAX(COALESCE(amount,0) - COALESCE(paid_amount,0), 0)';

function pay_status($amount, $paid) {
    $amount = (float)$amount; $paid = (float)$paid;
    if ($amount <= 0) return $paid > 0 ? 'paid' : 'unpaid';
    if ($paid >= $amount) return 'paid';
    return $paid > 0 ? 'partial' : 'unpaid';
}

function owed($row) {
    return max((float)($row['amount'] ?? 0) - (float)($row['paid_amount'] ?? 0), 0);
}

// keeps orders.paid_amount / payment_status in step with the payments table
function recalc_order($pdo, $orderId) {
    $s = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id = ?');
    $s->execute([$orderId]);
    $paid = (float)$s->fetchColumn();
    $a = $pdo->prepare('SELECT amount FROM orders WHERE id = ?');
    $a->execute([$orderId]);
    $amount = $a->fetchColumn();
    $pdo->prepare('UPDATE orders SET paid_amount = ?, payment_status = ? WHERE id = ?')->execute([$paid, pay_status($amount, $paid), $orderId]);
}

function add_payment($pdo, $orderId, $amount, $method, $date, $note = '') {
    $amount = (float)$amount;
    if ($amount <= 0) return false;
    $method = in_array($method, PAY_METHODS, true) ? $method : 'Other';
    $date = valid_date($date) ? $date : date('Y-m-d');
    $pdo->prepare('INSERT INTO payments (order_id, amount, method, paid_at, note) VALUES (?,?,?,?,?)')->execute([$orderId, $amount, $method, $date, mb_substr($note, 0, 200)]);
    recalc_order($pdo, $orderId);
    return true;
}

// ---------- audit trail and trash (recoverable deletes) ----------
function audit($action, $detail = '') {
    $u = current_user();
    $pdo = get_db();
    $pdo->prepare('INSERT INTO audit_log (ts, username, action, detail) VALUES (?,?,?,?)')
        ->execute([time(), $u['username'] ?? 'system', mb_substr($action, 0, 60), mb_substr((string)$detail, 0, 300)]);
    $pdo->exec('DELETE FROM audit_log WHERE ts < ' . (time() - 365 * 86400));
}

function trash_put($kind, $label, $payload) {
    $u = current_user();
    $pdo = get_db();
    $pdo->prepare('INSERT INTO trash (kind, label, payload, deleted_by, deleted_at) VALUES (?,?,?,?,?)')
        ->execute([$kind, mb_substr($label, 0, 120), json_encode($payload), $u['username'] ?? 'system', time()]);
    $pdo->exec('DELETE FROM trash WHERE deleted_at < ' . (time() - 90 * 86400));
}

// follow-ups that are due today or overdue (for the sidebar badge)
function due_followups_count() {
    static $n = null;
    if ($n === null) {
        $s = get_db()->prepare("SELECT COUNT(*) FROM clients WHERE next_followup IS NOT NULL AND next_followup != '' AND next_followup <= ? AND stage IN ('lead','active')");
        $s->execute([date('Y-m-d')]);
        $n = (int)$s->fetchColumn();
    }
    return $n;
}

const EXPENSE_CATEGORIES = ['Ads / promotion', 'Tools / software', 'Hosting / domain', 'Internet / phone', 'Staff / helper', 'Other'];

// Ready-made WhatsApp messages. {name} is replaced with the client's name.
const MSG_TEMPLATES = [
    'Greeting' => 'Assalam o Alaikum {name}, this is Nibaha Haq from lmshandling.com. How can I help you today?',
    'Files sent' => 'Assalam o Alaikum {name}, your files have been sent. Please check and confirm that you received them. JazakAllah.',
    'Payment reminder' => 'Assalam o Alaikum {name}, a friendly reminder about the pending payment for your order. Please let me know once it is done. JazakAllah.',
    'Follow-up' => 'Assalam o Alaikum {name}, just checking in. Do you need any help with your VU subjects, quizzes or exams?',
    'Thank you' => 'Thank you {name} for choosing Nibaha Haq. Please share your feedback, and let us know if you need anything else.',
];

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

// finds another client with the same phone number (normalised), or null
function find_client_by_phone($pdo, $phone, $exceptId = 0) {
    $n = wa_number($phone);
    if (strlen($n) < 10) return null;
    foreach ($pdo->query('SELECT id, name, whatsapp_number FROM clients') as $c) {
        if ((int)$c['id'] !== (int)$exceptId && wa_number($c['whatsapp_number']) === $n) return $c;
    }
    return null;
}

// VU student ID such as BC250411610, kept upper-case without spaces
function clean_vu_id($raw) {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', mb_substr((string)$raw, 0, 24)));
}

function find_client_by_vu_id($pdo, $vuId, $exceptId = 0) {
    $v = clean_vu_id($vuId);
    if (strlen($v) < 6) return null;
    $s = $pdo->prepare('SELECT id, name FROM clients WHERE upper(vu_id) = ? AND id != ? LIMIT 1');
    $s->execute([$v, (int)$exceptId]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

function clean_tags($raw) {
    $tags = [];
    foreach (preg_split('/[,\n]+/', (string)$raw) as $t) {
        $t = trim(mb_substr(preg_replace('/\s+/', ' ', $t), 0, 24));
        if ($t !== '' && !in_array(mb_strtolower($t), array_map('mb_strtolower', $tags), true)) $tags[] = $t;
    }
    return implode(', ', array_slice($tags, 0, 10));
}
