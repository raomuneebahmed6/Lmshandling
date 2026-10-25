<?php
require_once __DIR__ . '/includes/auth.php';
ensure_default_admin();

if (current_user() || !unclaimed_admin_exists()) {
    redirect('/dashboard/login');
}

$pdo = get_db();
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $code = strtoupper(trim((string)($_POST['code'] ?? '')));
    $pw = (string)($_POST['password'] ?? '');
    $pw2 = (string)($_POST['password2'] ?? '');
    if (login_blocked('setup-code')) {
        $error = 'Too many attempts. Please wait 15 minutes and try again.';
    } elseif (!password_verify($code, settings_get('setup_code_hash'))) {
        login_failed('setup-code');
        log_login(null, 'setup', false, 'wrong setup code');
        $error = 'That setup code is not correct.';
    } elseif (($weak = weak_password($pw, 'admin')) !== '') {
        $error = $weak;
    } elseif ($pw !== $pw2) {
        $error = 'The two passwords do not match.';
    } else {
        $u = $pdo->query("SELECT * FROM users WHERE must_change = 1 AND role = 'admin' AND active = 1 ORDER BY id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        if ($u) {
            $pdo->prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
            settings_set('setup_code_hash', '');
            @unlink(private_path('setup-code.txt'));
            $u['must_change'] = 0;
            login_success($u);
            audit('account claimed', $u['username']);
            flash('Your password is set. Now turn on two-step login.');
            redirect('/dashboard/change_password#twofa');
        }
        $error = 'There is nothing to set up.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>First-time setup | Nibaha Haq</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/favicon-32x32.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=8">
<script src="/dashboard/assets/dash.js?v=7" defer></script>
</head>
<body class="login">
<main class="login-card">
  <div class="logo">
    <img src="/assets/logo.webp" alt="" width="52" height="52">
    <div><h1>First-time setup</h1><p>Claim the admin account</p></div>
  </div>
  <?php if ($error): ?><div class="msg msg-err" role="alert"><?php echo e($error); ?></div><?php endif; ?>
  <p class="muted" style="margin-top:0">Enter the setup code from the email sent to the business address, or from the file <strong>setup-code.txt</strong> in the <strong>lmh_private</strong> folder (next to <em>public_html</em>) in your hosting File Manager. If there is no such folder, look in <em>public_html/dashboard/data</em>. Then choose your own password.</p>
  <form method="post" class="stack" autocomplete="off">
    <?php echo csrf_field(); ?>
    <div><label for="code">Setup code</label><input id="code" name="code" required autofocus autocomplete="off" placeholder="XXXXX-XXXXX" style="text-transform:uppercase"></div>
    <div><label for="pw">New password (10+ characters)</label><div class="passwrap"><input id="pw" type="password" name="password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="pw" aria-pressed="false">Show</button></div></div>
    <div><label for="pw2">Repeat the password</label><div class="passwrap"><input id="pw2" type="password" name="password2" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="pw2" aria-pressed="false">Show</button></div></div>
    <button type="submit" class="gold">Set password and continue</button>
  </form>
  <div class="login-foot"><a href="/dashboard/login">Back to login</a></div>
</main>
</body>
</html>
