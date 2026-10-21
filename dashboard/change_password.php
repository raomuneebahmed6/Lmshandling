<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();
$uid = current_user()['id'];

function load_user($pdo, $uid) {
    $s = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $s->execute([$uid]);
    return $s->fetch(PDO::FETCH_ASSOC);
}

$msg = '';
$msgType = '';
$newCodes = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? 'password';
    $user = load_user($pdo, $uid);

    if ($do === 'password') {
        $current = (string)($_POST['current_password'] ?? '');
        $new = (string)($_POST['new_password'] ?? '');
        $confirm = (string)($_POST['confirm_password'] ?? '');
        if (!password_verify($current, $user['password_hash'])) {
            $msg = 'Current password is incorrect.'; $msgType = 'err';
        } elseif (strlen($new) < 10) {
            $msg = 'New password must be at least 10 characters.'; $msgType = 'err';
        } elseif ($new === DEFAULT_ADMIN_PASSWORD) {
            $msg = 'Please choose a different password.'; $msgType = 'err';
        } elseif ($new !== $confirm) {
            $msg = 'New password and confirmation do not match.'; $msgType = 'err';
        } else {
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $uid]);
            $_SESSION['default_pw'] = false;
            session_regenerate_id(true);
            flash('Password updated.');
            redirect('/dashboard/index.php');
        }
    } elseif ($do === '2fa_start') {
        if (!empty($_SESSION['default_pw'])) { redirect('/dashboard/change_password.php'); }
        $_SESSION['totp_setup'] = totp_new_secret();
        redirect('/dashboard/change_password.php#twofa');
    } elseif ($do === '2fa_cancel') {
        unset($_SESSION['totp_setup']);
        redirect('/dashboard/change_password.php#twofa');
    } elseif ($do === '2fa_confirm') {
        $secret = $_SESSION['totp_setup'] ?? '';
        if ($secret && totp_verify($secret, $_POST['code'] ?? '') !== false) {
            [$plain, $hashed] = new_recovery_codes();
            $pdo->prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, recovery_codes = ? WHERE id = ?')->execute([$secret, json_encode($hashed), $uid]);
            unset($_SESSION['totp_setup']);
            $newCodes = $plain;
            $msg = 'Two-step login is now ON.'; $msgType = 'ok';
        } else {
            $msg = 'That code did not match. Check the time on your phone and try the newest code.'; $msgType = 'err';
        }
    } elseif ($do === '2fa_disable') {
        if (!password_verify((string)($_POST['current_password'] ?? ''), $user['password_hash'])) {
            $msg = 'Password is incorrect, two-step login stays ON.'; $msgType = 'err';
        } else {
            $pdo->prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?')->execute([$uid]);
            flash('Two-step login turned off.');
            redirect('/dashboard/change_password.php#twofa');
        }
    } elseif ($do === '2fa_codes') {
        if (!password_verify((string)($_POST['current_password'] ?? ''), $user['password_hash'])) {
            $msg = 'Password is incorrect.'; $msgType = 'err';
        } else {
            [$plain, $hashed] = new_recovery_codes();
            $pdo->prepare('UPDATE users SET recovery_codes = ? WHERE id = ?')->execute([json_encode($hashed), $uid]);
            $newCodes = $plain;
            $msg = 'New recovery codes created. The old ones no longer work.'; $msgType = 'ok';
        }
    }
}

$user = load_user($pdo, $uid);
$setup = $_SESSION['totp_setup'] ?? '';
$left = count(json_decode((string)$user['recovery_codes'], true) ?: []);
$log = $pdo->prepare('SELECT * FROM login_log WHERE user_id = ? OR username = ? ORDER BY ts DESC LIMIT 12');
$log->execute([$uid, $user['username']]);
$history = $log->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Security';
$page = 'settings';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if (!empty($_SESSION['default_pw'])): ?><div class="msg msg-warn">You are using the starting password. Set your own password to continue.</div><?php endif; ?>
<?php if ($msg): ?><div class="msg msg-<?php echo e($msgType); ?>"><?php echo e($msg); ?></div><?php endif; ?>

<div class="grid2">
<div>
<section class="card">
  <div class="card-head"><h2>Change password</h2></div>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="password">
    <div><label for="cp">Current password</label><div class="passwrap"><input id="cp" type="password" name="current_password" required autocomplete="current-password"><button type="button" data-toggle-pass="cp" aria-pressed="false">Show</button></div></div>
    <div><label for="np">New password (10+ characters)</label><div class="passwrap"><input id="np" type="password" name="new_password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="np" aria-pressed="false">Show</button></div></div>
    <div><label for="cf">Confirm new password</label><div class="passwrap"><input id="cf" type="password" name="confirm_password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="cf" aria-pressed="false">Show</button></div></div>
    <div><button type="submit" class="gold">Update password</button></div>
  </form>
</section>

<section class="card" id="twofa">
  <div class="card-head"><h2>Two-step login (authenticator app)</h2>
    <span class="badge b-<?php echo $user['totp_enabled'] ? 'paid' : 'unpaid'; ?>"><?php echo $user['totp_enabled'] ? 'ON' : 'OFF'; ?></span></div>
  <?php if ($newCodes): ?>
    <div class="msg msg-warn"><strong>Save these recovery codes now.</strong> Each works once if you lose your phone. They are not shown again.</div>
    <pre class="codes"><?php echo e(implode("\n", $newCodes)); ?></pre>
  <?php endif; ?>
  <?php if ($user['totp_enabled']): ?>
    <p class="muted" style="margin-top:0">Login asks for a 6-digit code after the password. Recovery codes left: <strong><?php echo $left; ?></strong>.</p>
    <form method="post" class="stack" style="max-width:360px">
      <?php echo csrf_field(); ?>
      <div><label for="p2">Your password (to confirm)</label><input id="p2" type="password" name="current_password" required autocomplete="current-password"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" name="do" value="2fa_codes" class="ghost sm">Make new recovery codes</button>
        <button type="submit" name="do" value="2fa_disable" class="danger sm">Turn off</button>
      </div>
    </form>
  <?php elseif ($setup): ?>
    <ol class="steps">
      <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
      <li>Add a new account with <strong>"Enter a setup key"</strong> and type this key (time-based):</li>
    </ol>
    <pre class="codes"><?php echo e(trim(chunk_split($setup, 4, ' '))); ?></pre>
    <p class="muted">Account name: Nibaha Haq CRM &middot; <?php echo e($user['username']); ?></p>
    <form method="post" class="stack" style="max-width:360px">
      <?php echo csrf_field(); ?><input type="hidden" name="do" value="2fa_confirm">
      <div><label for="tc">Enter the 6-digit code the app shows</label><input id="tc" name="code" required inputmode="numeric" autocomplete="one-time-code" placeholder="123456"></div>
      <div style="display:flex;gap:8px"><button type="submit" class="gold">Turn on</button><button type="submit" name="do" value="2fa_cancel" class="ghost" formnovalidate>Cancel</button></div>
    </form>
  <?php else: ?>
    <p class="muted" style="margin-top:0">Adds a second lock: even if someone learns your password, they also need the code from your phone.</p>
    <?php if (!empty($_SESSION['default_pw'])): ?>
      <p class="muted">Set your own password first.</p>
    <?php else: ?>
    <form method="post"><?php echo csrf_field(); ?><input type="hidden" name="do" value="2fa_start"><button type="submit">Set up two-step login</button></form>
    <?php endif; ?>
  <?php endif; ?>
</section>
</div>

<section class="card">
  <div class="card-head"><h2>Recent logins</h2></div>
  <?php if (!$history): ?><div class="empty">No history yet.</div><?php else: ?>
  <ul class="list">
    <?php foreach ($history as $h): ?>
    <li><span><strong><?php echo $h['ok'] ? 'Signed in' : 'Failed'; ?></strong><?php echo $h['note'] ? ' (' . e($h['note']) . ')' : ''; ?><br>
      <span class="muted"><?php echo e(date('Y-m-d H:i', $h['ts'])); ?> &middot; <?php echo e($h['ip']); ?></span></span>
      <span class="badge b-<?php echo $h['ok'] ? 'paid' : 'unpaid'; ?>"><?php echo $h['ok'] ? 'OK' : 'No'; ?></span></li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
</section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
