<?php
// Database backups. Files go to data/backups/ (blocked from the web by data/.htaccess).
require_once __DIR__ . '/db.php';

const BACKUP_KEEP = 14;

function backup_dir() {
    $d = private_path('backups');
    if (!is_dir($d)) {
        mkdir($d, 0700, true);
    }
    return $d;
}

function make_backup() {
    $pdo = get_db();
    $file = backup_dir() . '/dashboard-' . date('Ymd-His') . '.sqlite';
    try {
        // consistent snapshot (SQLite 3.27+)
        $pdo->exec("VACUUM INTO '" . str_replace("'", "''", $file) . "'");
    } catch (Throwable $e) {
        copy(db_path(), $file);
    }
    // keep only the newest BACKUP_KEEP files
    $all = glob(backup_dir() . '/dashboard-*.sqlite') ?: [];
    rsort($all);
    foreach (array_slice($all, BACKUP_KEEP) as $old) {
        @unlink($old);
    }
    return basename($file);
}

function list_backups() {
    $all = glob(backup_dir() . '/dashboard-*.sqlite') ?: [];
    rsort($all);
    $out = [];
    foreach ($all as $f) {
        $out[] = ['name' => basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
    }
    return $out;
}
