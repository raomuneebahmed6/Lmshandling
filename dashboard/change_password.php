<?php
require_once __DIR__ . '/includes/auth.php';
require_login();

$msg = '';
$msgType = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $current = (string)($_POST['current_password'] ?? '');
    $new = (string)($_POST['new_password'] ?? '');
    $confirm = (string)($_POST['confirm_password'] ?? '');
    $pdo = get_db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([current_user()['id']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!password_verify($current, $user['password_hash'])) {
        $msg = 'Current password is incorrect.';
        $msgType = 'err';
    } elseif (strlen($new) < 10) {
        $msg = 'New password must be at least 10 characters.';
        $msgType = 'err';
    } elseif ($new === DEFAULT_ADMIN_PASSWORD) {
        $msg = 'Please choose a different password.';
        $msgType = 'err';
    } elseif ($new !== $confirm) {
        $msg = 'New password and confirmation do not match.';
        $msgType = 'err';
    } else {
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
        $_SESSION['default_pw'] = false;
        session_regenerate_id(true);
        flash('Password updated.');
        redirect('/dashboard/index.php');
    }
}

$pageTitle = 'Change password';
$page = 'settings';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="card" style="max-width:460px">
  <?php if (!empty($_SESSION['default_pw'])): ?><div class="msg msg-warn">You are using the starting password. Set your own password to continue.</div><?php endif; ?>
  <?php if ($msg): ?><div class="msg msg-<?php echo e($msgType); ?>"><?php echo e($msg); ?></div><?php endif; ?>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?>
    <div><label for="cp">Current password</label><div class="passwrap"><input id="cp" type="password" name="current_password" required autocomplete="current-password"><button type="button" data-toggle-pass="cp" aria-pressed="false">Show</button></div></div>
    <div><label for="np">New password (10+ characters)</label><div class="passwrap"><input id="np" type="password" name="new_password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="np" aria-pressed="false">Show</button></div></div>
    <div><label for="cf">Confirm new password</label><div class="passwrap"><input id="cf" type="password" name="confirm_password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="cf" aria-pressed="false">Show</button></div></div>
    <div><button type="submit" class="gold">Update password</button></div>
  </form>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
