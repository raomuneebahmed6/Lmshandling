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
        } elseif (($weak = weak_password($new, $user['username'])) !== '') {
            $msg = $weak; $msgType = 'err';
        } elseif ($new === $current) {
            $msg = 'The new password must be different from the current one.'; $msgType = 'err';
        } elseif ($new !== $confirm) {
            $msg = 'New password and confirmation do not match.'; $msgType = 'err';
        } else {
            $pdo->prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $uid]);
            $_SESSION['default_pw'] = false;
            audit('password changed', $user['username']);
            session_regenerate_id(true);
            flash('Password updated.');
            redirect('/dashboard/');
        }
    } elseif ($do === '2fa_start' || $do === '2fa_add') {
        if (!empty($_SESSION['default_pw'])) { redirect('/dashboard/change_password'); }
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM totp_devices WHERE user_id = ?'); $cnt->execute([$uid]);
        if ($do === '2fa_add' && !password_verify((string)($_POST['current_password'] ?? ''), $user['password_hash'])) {
            $msg = 'Password is incorrect.'; $msgType = 'err';
        } elseif ((int)$cnt->fetchColumn() >= 5) {
            $msg = 'You can add up to 5 phones. Remove one first.'; $msgType = 'err';
        } else {
            $_SESSION['totp_setup'] = totp_new_secret();
            $_SESSION['totp_setup_name'] = mb_substr(trim((string)($_POST['device_name'] ?? '')), 0, 30);
            redirect('/dashboard/change_password#twofa');
        }
    } elseif ($do === '2fa_cancel') {
        unset($_SESSION['totp_setup'], $_SESSION['totp_setup_name']);
        redirect('/dashboard/change_password#twofa');
    } elseif ($do === '2fa_confirm') {
        $secret = $_SESSION['totp_setup'] ?? '';
        if ($secret && totp_verify($secret, $_POST['code'] ?? '') !== false) {
            $cnt = $pdo->prepare('SELECT COUNT(*) FROM totp_devices WHERE user_id = ?'); $cnt->execute([$uid]);
            $n = (int)$cnt->fetchColumn();
            $name = ($_SESSION['totp_setup_name'] ?? '') !== '' ? $_SESSION['totp_setup_name'] : 'Phone ' . ($n + 1);
            $pdo->prepare('INSERT INTO totp_devices (user_id, name, secret, last_counter, created_at) VALUES (?,?,?,?,?)')->execute([$uid, $name, $secret, 0, time()]);
            if ($n === 0) {
                [$plain, $hashed] = new_recovery_codes();
                $pdo->prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, recovery_codes = ? WHERE id = ?')->execute([$secret, json_encode($hashed), $uid]);
                $newCodes = $plain;
                $msg = 'Two-step login is now ON.';
            } else {
                $msg = '"' . $name . '" was added. Now ' . ($n + 1) . ' phones can approve a login.';
            }
            $msgType = 'ok';
            unset($_SESSION['totp_setup'], $_SESSION['totp_setup_name']);
            $_SESSION['has2fa'] = true;
            audit('2FA phone added', $user['username'] . ': ' . $name);
        } else {
            $msg = 'That code did not match. Check the time on your phone and try the newest code.'; $msgType = 'err';
        }
    } elseif ($do === '2fa_disable') {
        if (!password_verify((string)($_POST['current_password'] ?? ''), $user['password_hash'])) {
            $msg = 'Password is incorrect, two-step login stays ON.'; $msgType = 'err';
        } else {
            $pdo->prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?')->execute([$uid]);
            $pdo->prepare('DELETE FROM totp_devices WHERE user_id = ?')->execute([$uid]);
            $_SESSION['has2fa'] = false;
            audit('2FA turned off', $user['username']);
            flash('Two-step login turned off.');
            redirect('/dashboard/change_password#twofa');
        }
    } elseif ($do === '2fa_remove') {
        $did = (int)($_POST['device_id'] ?? 0);
        if (!password_verify((string)($_POST['current_password'] ?? ''), $user['password_hash'])) {
            $msg = 'Password is incorrect. The phone was not removed.'; $msgType = 'err';
        } else {
            $pdo->prepare('DELETE FROM totp_devices WHERE id = ? AND user_id = ?')->execute([$did, $uid]);
            $cnt = $pdo->prepare('SELECT COUNT(*) FROM totp_devices WHERE user_id = ?'); $cnt->execute([$uid]);
            audit('2FA phone removed', $user['username'] . ' #' . $did);
            if ((int)$cnt->fetchColumn() === 0) {
                $pdo->prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?')->execute([$uid]);
                $_SESSION['has2fa'] = false;
                flash('That was your last phone, so two-step login is now OFF. Set it up again to keep your account safe.', 'warn');
            } else {
                flash('Phone removed.');
            }
            redirect('/dashboard/change_password#twofa');
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
$devq = $pdo->prepare('SELECT id, name, created_at, last_counter FROM totp_devices WHERE user_id = ? ORDER BY id');
$devq->execute([$uid]);
$devices = $devq->fetchAll(PDO::FETCH_ASSOC);
$left = count(json_decode((string)$user['recovery_codes'], true) ?: []);
$log = $pdo->prepare('SELECT * FROM login_log WHERE user_id = ? OR username = ? ORDER BY ts DESC LIMIT 12');
$log->execute([$uid, $user['username']]);
$history = $log->fetchAll(PDO::FETCH_ASSOC);

$check = [];
if (is_admin()) {
    require_once __DIR__ . '/includes/backup.php';
    $noTfa = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE active = 1 AND totp_enabled = 0")->fetchColumn();
    $failed = (int)$pdo->query("SELECT COUNT(*) FROM login_log WHERE ok = 0 AND ts > " . (time() - 86400))->fetchColumn();
    $bk = list_backups();
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $check = [
        ['Your two-step login is on', !empty($user['totp_enabled']), 'Turn it on below.'],
        ['Everyone with an account uses two-step login', $noTfa === 0, $noTfa . ' account(s) still without it (Team page).'],
        ['Two-step login is required for all', two_factor_required(), 'Switch it on in Settings.'],
        ['Database and backups are stored outside the public web folder', private_is_outside_web(), 'The host did not allow a private folder, so the protected data/ folder is used.'],
        ['Chats are encrypted before they are saved', crypto_available(), 'This server has no encryption library; chats are stored as plain text.'],
        ['Connection is HTTPS', $isHttps, 'Open the dashboard with https://.'],
        ['No pending first-time setup code', !unclaimed_admin_exists(), 'An account is still waiting to be claimed.'],
        ['Fewer than 10 failed logins in the last 24 hours', $failed < 10, $failed . ' failed attempts. Check Recent logins.'],
        ['A backup exists from the last 7 days', $bk && $bk[0]['time'] > time() - 7 * 86400, 'Make one on the Backup page.'],
        ['PHP version is current (8.1 or newer)', version_compare(PHP_VERSION, '8.1', '>='), 'PHP ' . PHP_VERSION . '. Update it in hosting settings.'],
    ];
}

$pageTitle = 'Security';
$page = 'settings';
include __DIR__ . '/includes/layout_top.php';
$user = load_user($pdo, $uid); // the layout reuses $user for the signed-in account; this page needs the full row
?>
<?php if (!empty($_SESSION['default_pw'])): ?><div class="msg msg-warn">You are using the starting password. Set your own password to continue.</div><?php endif; ?>
<?php if ($msg): ?><div class="msg msg-<?php echo e($msgType); ?>"><?php echo e($msg); ?></div><?php endif; ?>

<?php if ($check): $okN = count(array_filter($check, fn($c) => $c[1])); ?>
<section class="card">
  <div class="card-head"><h2>Security checklist</h2><span class="badge b-<?php echo $okN === count($check) ? 'paid' : 'pending'; ?>"><?php echo $okN; ?> of <?php echo count($check); ?> OK</span></div>
  <ul class="list">
    <?php foreach ($check as $c): ?><li><span><?php echo $c[1] ? '&#10003;' : '&#9888;'; ?> <?php echo e($c[0]); ?><?php echo $c[1] ? '' : '<br><span class="muted">' . e($c[2]) . '</span>'; ?></span><span class="badge b-<?php echo $c[1] ? 'paid' : 'unpaid'; ?>"><?php echo $c[1] ? 'OK' : 'Fix'; ?></span></li><?php endforeach; ?>
  </ul>
</section>
<?php endif; ?>
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
  <?php if (!$setup && $user['totp_enabled']): ?>
    <p class="muted" style="margin-top:0">Login asks for a 6-digit code after the password. Any one of your phones below can approve it. Recovery codes left: <strong><?php echo $left; ?></strong>.</p>
    <?php if ($devices): ?>
    <ul class="list" style="margin-bottom:14px">
      <?php foreach ($devices as $dv): ?><li><span><strong><?php echo e($dv['name']); ?></strong><br><span class="muted">added <?php echo e(date('Y-m-d', (int)$dv['created_at'])); ?><?php echo $dv['last_counter'] ? ' &middot; last used ' . e(date('Y-m-d H:i', (int)$dv['last_counter'] * 30)) : ''; ?></span></span>
        <form method="post" class="inline" data-confirm="Remove this phone? It will stop working for login."><?php echo csrf_field(); ?><input type="hidden" name="do" value="2fa_remove"><input type="hidden" name="device_id" value="<?php echo (int)$dv['id']; ?>">
          <input type="password" name="current_password" placeholder="Your password" required autocomplete="current-password" style="width:150px;display:inline-block" aria-label="Your password to remove this phone"> <button class="danger sm" type="submit">Remove</button></form></li><?php endforeach; ?>
    </ul>
    <form method="post" class="stack" style="max-width:420px;margin-bottom:16px">
      <?php echo csrf_field(); ?><input type="hidden" name="do" value="2fa_add">
      <div class="row2"><div><label for="dn">Name for the new phone</label><input id="dn" name="device_name" maxlength="30" placeholder="e.g. Second phone"></div>
      <div><label for="dp">Your password</label><input id="dp" type="password" name="current_password" required autocomplete="current-password"></div></div>
      <div><button type="submit" class="ghost sm">Add another phone</button> <span class="muted">(up to 5)</span></div>
    </form>
    <?php endif; ?>
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
    <p class="muted" style="margin-top:0">Tip: you can type the <em>same</em> key into a second phone right now. Or add more phones later with their own keys from this page.</p>
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
