<?php
require_once __DIR__ . '/includes/auth.php';
require_login();

$msg = '';
$msgType = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $current = $_POST['current_password'] ?? '';
    $new = $_POST['new_password'] ?? '';
    $confirm = $_POST['confirm_password'] ?? '';
    $pdo = get_db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([current_user()['id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!password_verify($current, $user['password_hash'])) {
        $msg = 'Current password is incorrect.';
        $msgType = 'err';
    } elseif (strlen($new) < 8) {
        $msg = 'New password must be at least 8 characters.';
        $msgType = 'err';
    } elseif ($new !== $confirm) {
        $msg = 'New password and confirmation do not match.';
        $msgType = 'err';
    } else {
        $stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
        $msg = 'Password updated.';
        $msgType = 'ok';
    }
}

$pageTitle = 'Change Password';
$page = '';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="card" style="max-width:400px">
  <h2 style="margin-top:0">Change Password</h2>
  <?php if ($msg): ?><div class="msg msg-<?php echo $msgType; ?>"><?php echo htmlspecialchars($msg); ?></div><?php endif; ?>
  <form method="post">
    <label>Current Password</label>
    <input type="password" name="current_password" required>
    <label>New Password</label>
    <input type="password" name="new_password" required>
    <label>Confirm New Password</label>
    <input type="password" name="confirm_password" required>
    <button type="submit">Update Password</button>
  </form>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
