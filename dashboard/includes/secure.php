<?php
// Private storage, encryption at rest and first-run account claiming.
//
// The database, its backups, the encryption key and the sessions live OUTSIDE the public web folder
// whenever the host allows it (a folder named "lmh_private" next to public_html). If that is not
// possible the old data/ folder is used; it is blocked from the web by .htaccess.

const LEGACY_DEFAULT_PASSWORD = 'ChangeMe123!'; // the old public starting password; any account still using it is locked until it is claimed

function site_root() {
    return dirname(__DIR__, 2); // .../public_html
}

function copy_verified($from, $to) {
    if (!is_file($from)) return false;
    if (!@copy($from, $to)) return false;
    return sha1_file($from) === sha1_file($to);
}

// Returns the folder for private files and, once per request, moves older data into it.
function private_dir() {
    static $dir = null;
    if ($dir !== null) return $dir;
    $legacy = __DIR__ . '/../data';
    $marker = $legacy . '/.moved';
    $cands = [];
    $env = getenv('LMH_PRIVATE_DIR');
    if ($env) $cands[] = $env;
    $cands[] = dirname(site_root()) . '/lmh_private';
    $chosen = null;
    foreach ($cands as $c) {
        if (!is_dir($c)) @mkdir($c, 0700, true);
        if (is_dir($c) && is_writable($c)) { $chosen = realpath($c) ?: $c; break; }
    }
    if ($chosen === null) {
        // private folder impossible. If data was already moved, refuse to quietly use an old copy.
        if (is_file($marker)) { http_response_code(503); exit('Private storage is unavailable. Contact the site owner.'); }
        if (!is_dir($legacy)) @mkdir($legacy, 0700, true);
        $dir = realpath($legacy) ?: $legacy;
        return $dir;
    }
    $dir = $chosen;
    @chmod($dir, 0700);
    // one-time move of the database and backups from the old web-folder location
    $oldDb = $legacy . '/dashboard.sqlite';
    $newDb = $dir . '/dashboard.sqlite';
    if (is_file($oldDb) && !is_file($newDb)) {
        if (copy_verified($oldDb, $newDb)) {
            @file_put_contents($marker, 'moved ' . date('c'));
            @unlink($oldDb);
        }
    } elseif (is_file($oldDb) && is_file($newDb) && !is_file($marker)) {
        @file_put_contents($marker, 'moved ' . date('c'));
    }
    $oldBk = $legacy . '/backups';
    if (is_dir($oldBk)) {
        $newBk = $dir . '/backups';
        if (!is_dir($newBk)) @mkdir($newBk, 0700, true);
        foreach (glob($oldBk . '/*.sqlite') ?: [] as $f) {
            if (copy_verified($f, $newBk . '/' . basename($f))) @unlink($f);
        }
    }
    return $dir;
}

function private_path($name) {
    return private_dir() . '/' . $name;
}

function private_is_outside_web() {
    return realpath(private_dir()) !== realpath(__DIR__ . '/../data');
}

function db_path() {
    return private_path('dashboard.sqlite');
}

// ---------- encryption at rest (chats) ----------
function secret_key() {
    static $k = null;
    if ($k !== null) return $k;
    $f = private_path('secret.key');
    if (is_file($f)) {
        $k = base64_decode(trim((string)file_get_contents($f)), true);
        if ($k !== false && strlen($k) === 32) return $k;
    }
    $k = random_bytes(32);
    @file_put_contents($f, base64_encode($k));
    @chmod($f, 0600);
    return $k;
}

function crypto_available() {
    return function_exists('sodium_crypto_secretbox');
}

function secret_encrypt($plain) {
    if (!crypto_available()) return $plain;
    $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return 'enc1:' . base64_encode($n . sodium_crypto_secretbox((string)$plain, $n, secret_key()));
}

function secret_decrypt($s) {
    $s = (string)$s;
    if (strpos($s, 'enc1:') !== 0) return $s; // older, unencrypted rows
    if (!crypto_available()) return '[encrypted: this server cannot decrypt]';
    $raw = base64_decode(substr($s, 5), true);
    $nl = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
    if ($raw === false || strlen($raw) <= $nl) return '[unreadable]';
    $p = sodium_crypto_secretbox_open(substr($raw, $nl), substr($raw, 0, $nl), secret_key());
    return $p === false ? '[unreadable: wrong key]' : $p;
}

// ---------- settings (tiny key/value store) ----------
function settings_get($k, $default = '') {
    $s = get_db()->prepare('SELECT v FROM settings WHERE k = ?');
    $s->execute([$k]);
    $v = $s->fetchColumn();
    return $v === false ? $default : $v;
}

function settings_set($k, $v) {
    get_db()->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, (string)$v]);
}

// ---------- claiming the first account ----------
// A fresh install (or an account that still had the old public default password) has an unknown random
// password. The owner proves they control the hosting by reading a one-time code from the private
// folder (setup-code.txt) or from the email sent to the business address, then chooses a password.
function issue_setup_code() {
    $raw = strtoupper(bin2hex(random_bytes(5)));
    $code = substr($raw, 0, 5) . '-' . substr($raw, 5);
    settings_set('setup_code_hash', password_hash($code, PASSWORD_DEFAULT));
    $note = "Dashboard setup code: $code\n\nOpen https://lmshandling.com/dashboard/setup , enter this code and choose your own password.\nThis file is deleted automatically after you finish.\n";
    @file_put_contents(private_path('setup-code.txt'), $note);
    @chmod(private_path('setup-code.txt'), 0600);
    $to = settings_get('summary_email') ?: 'nibahahaqvu1@gmail.com';
    @mail($to, 'Your dashboard setup code', "Assalam o Alaikum,\n\n" . $note . "\nIf you did not ask for this, ignore it and tell the site owner.", "From: Nibaha Haq CRM <no-reply@lmshandling.com>\r\nContent-Type: text/plain; charset=UTF-8");
    return $code;
}

function unclaimed_admin_exists() {
    if (settings_get('setup_code_hash') === '') return false;
    return (int)get_db()->query("SELECT COUNT(*) FROM users WHERE must_change = 1 AND role = 'admin' AND active = 1")->fetchColumn() > 0;
}

function reset_admin_account() {
    $pdo = get_db();
    $id = $pdo->query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")->fetchColumn();
    if (!$id) return false;
    $pdo->prepare('UPDATE users SET password_hash = ?, must_change = 1, totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL, active = 1 WHERE id = ?')
        ->execute([password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), $id]);
    $pdo->prepare('DELETE FROM totp_devices WHERE user_id = ?')->execute([$id]);
    issue_setup_code();
    return true;
}
