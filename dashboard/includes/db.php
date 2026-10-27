<?php
// SQLite database. It lives in a private folder outside the web root when the host allows it
// (see secure.php), otherwise in data/ which .htaccess blocks. Migrations below are additive only:
// existing rows are never dropped or rewritten.
require_once __DIR__ . '/secure.php';

function db_add_columns($pdo, $table, $cols) {
    $have = [];
    foreach ($pdo->query("PRAGMA table_info($table)") as $col) {
        $have[$col['name']] = true;
    }
    $added = [];
    foreach ($cols as $name => $def) {
        if (!isset($have[$name])) {
            $pdo->exec("ALTER TABLE $table ADD COLUMN $name $def");
            $added[$name] = true;
        }
    }
    return $added;
}

function get_db() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $pdo = new PDO('sqlite:' . db_path());
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA foreign_keys = ON');

    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        whatsapp_number TEXT,
        course TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        amount REAL,
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        order_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'note',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        username TEXT NOT NULL,
        ts INTEGER NOT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        paid_at TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS login_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        ip TEXT,
        agent TEXT,
        ok INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        ts INTEGER NOT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
        k TEXT PRIMARY KEY,
        v TEXT
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spent_at TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS client_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        enc INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        uploaded_by TEXT,
        created_at INTEGER NOT NULL,
        deleted_at INTEGER
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files (client_id)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS deadlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        due_date TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'other',
        title TEXT NOT NULL,
        course TEXT,
        note TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS trash (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        label TEXT,
        payload TEXT NOT NULL,
        deleted_by TEXT,
        deleted_at INTEGER NOT NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        title TEXT,
        msg_count INTEGER NOT NULL DEFAULT 0,
        first_at TEXT,
        last_at TEXT,
        courses TEXT,
        sha TEXT,
        body TEXT NOT NULL,
        imported_by TEXT,
        imported_at INTEGER NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS totp_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        secret TEXT NOT NULL,
        last_counter INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // ---- additive columns ----
    $added = db_add_columns($pdo, 'clients', [
        'stage' => "TEXT NOT NULL DEFAULT 'lead'",
        'source' => 'TEXT',
        'next_followup' => 'TEXT',
        'tags' => 'TEXT',
        'vu_id' => 'TEXT',
    ]);
    // Clients that already have orders before this upgrade are existing customers
    if (isset($added['stage'])) {
        $pdo->exec("UPDATE clients SET stage='active' WHERE id IN (SELECT DISTINCT client_id FROM orders)");
    }

    $added = db_add_columns($pdo, 'orders', [
        'paid_amount' => 'REAL NOT NULL DEFAULT 0',
        'course_code' => 'TEXT',
        'exam_date' => 'TEXT',
        'files_note' => 'TEXT',
    ]);
    if (isset($added['paid_amount'])) {
        $pdo->exec("UPDATE orders SET paid_amount = COALESCE(amount, 0) WHERE payment_status = 'paid'");
    }
    // Orders that already show money received get one opening payment row, so history and totals agree
    $pdo->exec("INSERT INTO payments (order_id, amount, method, paid_at, note)
        SELECT o.id, o.paid_amount, 'Earlier', substr(o.order_date,1,10), 'Opening balance'
        FROM orders o WHERE o.paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)");

    db_add_columns($pdo, 'chats', [
        'last_ts' => 'INTEGER',
        'last_from' => 'TEXT',
        'insights' => 'TEXT',
    ]);

    db_add_columns($pdo, 'users', [
        'role' => "TEXT NOT NULL DEFAULT 'admin'",
        'totp_secret' => 'TEXT',
        'totp_enabled' => 'INTEGER NOT NULL DEFAULT 0',
        'recovery_codes' => 'TEXT',
        'active' => 'INTEGER NOT NULL DEFAULT 1',
        'must_change' => 'INTEGER NOT NULL DEFAULT 0',
    ]);

    // Accounts set up before several phones were supported get their existing phone as "Phone 1".
    $pdo->exec("INSERT INTO totp_devices (user_id, name, secret, last_counter, created_at)
        SELECT u.id, 'Phone 1', u.totp_secret, 0, strftime('%s','now') FROM users u
        WHERE u.totp_enabled = 1 AND u.totp_secret IS NOT NULL AND u.totp_secret != ''
        AND NOT EXISTS (SELECT 1 FROM totp_devices d WHERE d.user_id = u.id)");

    // One-time sweep: the old public starting password must not keep working. Any account that still uses it
    // gets an unknown random password and has to be claimed with a setup code.
    if (settings_get('default_sweep') !== '1') {
        $swept = 0;
        foreach ($pdo->query('SELECT id, password_hash FROM users')->fetchAll(PDO::FETCH_ASSOC) as $u) {
            if (password_verify(LEGACY_DEFAULT_PASSWORD, $u['password_hash'])) {
                $pdo->prepare('UPDATE users SET password_hash = ?, must_change = 1, totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?')
                    ->execute([password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), $u['id']]);
                $pdo->prepare('DELETE FROM totp_devices WHERE user_id = ?')->execute([$u['id']]);
                $swept++;
            }
        }
        settings_set('default_sweep', '1');
        if ($swept > 0) issue_setup_code();
    }

    return $pdo;
}
