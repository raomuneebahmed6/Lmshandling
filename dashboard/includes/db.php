<?php
// SQLite database. It lives in data/ and is blocked from direct HTTP access
// by data/.htaccess ("Require all denied"). Migrations below are additive only:
// existing rows are never dropped or rewritten.
function get_db() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dbPath = __DIR__ . '/../data/dashboard.sqlite';
    if (!is_dir(dirname($dbPath))) {
        mkdir(dirname($dbPath), 0755, true);
    }

    $pdo = new PDO('sqlite:' . $dbPath);
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

    // Additive CRM columns on clients
    $have = [];
    foreach ($pdo->query('PRAGMA table_info(clients)') as $col) {
        $have[$col['name']] = true;
    }
    $add = [
        'stage' => "TEXT NOT NULL DEFAULT 'lead'",
        'source' => 'TEXT',
        'next_followup' => 'TEXT',
    ];
    foreach ($add as $name => $def) {
        if (!isset($have[$name])) {
            $pdo->exec("ALTER TABLE clients ADD COLUMN $name $def");
        }
    }
    // Clients that already have orders before this upgrade are existing customers
    if (!isset($have['stage'])) {
        $pdo->exec("UPDATE clients SET stage='active' WHERE id IN (SELECT DISTINCT client_id FROM orders)");
    }

    return $pdo;
}
