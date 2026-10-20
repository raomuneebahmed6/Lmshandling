<?php
require_once __DIR__ . '/db.php';

session_start();

function current_user() {
    return $_SESSION['user'] ?? null;
}

function require_login() {
    if (!current_user()) {
        header('Location: /dashboard/login.php');
        exit;
    }
}

function ensure_default_admin() {
    $pdo = get_db();
    $count = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($count == 0) {
        // First run: create a default admin. Change this password immediately
        // after first login via the "Change Password" link.
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        $stmt->execute(['admin', password_hash('ChangeMe123!', PASSWORD_DEFAULT)]);
    }
}
