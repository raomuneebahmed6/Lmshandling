<?php
require_once __DIR__ . '/includes/auth.php';
ensure_default_admin();

if (current_user()) {
    redirect('/dashboard/');
}

$error = '';
$username = '';
$step = 1;

// step 2: password already accepted, waiting for the authenticator / recovery code
$pending = $_SESSION['pending_2fa'] ?? null;
if ($pending && time() - $pending['ts'] > 300) {
    unset($_SESSION['pending_2fa']);
    $pending = null;
}
if ($pending) $step = 2;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (($_POST['do'] ?? '') === 'cancel') {
        unset($_SESSION['pending_2fa']);
        redirect('/dashboard/login');
    }
    if ($step === 2) {
        $s = get_db()->prepare('SELECT * FROM users WHERE id = ? AND active = 1');
        $s->execute([$pending['id']]);
        $user = $s->fetch(PDO::FETCH_ASSOC);
        if (!$user || login_blocked($user['username'])) {
            $error = 'Too many attempts. Please wait 15 minutes and try again.';
        } elseif (second_factor_ok($user, $_POST['code'] ?? '')) {
            login_success($user);
            redirect($_SESSION['default_pw'] ? '/dashboard/change_password' : '/dashboard/');
        } else {
            login_failed($user['username']);
            log_login($user['id'], $user['username'], false, 'wrong 2FA code');
            $error = 'That code is not correct. Try the newest code from your app, or a recovery code.';
        }
    } else {
        $username = strtolower(trim($_POST['username'] ?? '')); // phones capitalise the first letter; usernames are stored in lowercase
        $password = (string)($_POST['password'] ?? '');
        if (login_blocked($username)) {
            $error = 'Too many attempts. Please wait 15 minutes and try again.';
        } else {
            $stmt = get_db()->prepare('SELECT * FROM users WHERE username = ? AND active = 1');
            $stmt->execute([$username]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($user && password_verify($password, $user['password_hash'])) {
                if (!empty($user['totp_enabled'])) {
                    $_SESSION['pending_2fa'] = ['id' => (int)$user['id'], 'ts' => time()];
                    redirect('/dashboard/login');
                }
                login_success($user);
                redirect($_SESSION['default_pw'] ? '/dashboard/change_password' : '/dashboard/');
            }
            login_failed($username);
            log_login($user['id'] ?? null, $username, false, 'wrong password');
            $error = 'Incorrect username or password.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login | Nibaha Haq</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/favicon-32x32.png" type="image/png">
<link rel="manifest" href="/dashboard/manifest.webmanifest">
<meta name="theme-color" content="#032B57">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=9">
<script src="/dashboard/assets/dash.js?v=7" defer></script>
</head>
<body class="login">
<main class="login-card">
  <div class="logo">
    <img src="/assets/logo.webp" alt="" width="52" height="52">
    <div><h1><?php echo $step === 2 ? 'Two-step check' : 'Welcome back'; ?></h1><p>Nibaha Haq &middot; Client CRM</p></div>
  </div>
  <?php if ($error): ?><div class="msg msg-err" role="alert"><?php echo e($error); ?></div><?php endif; ?>
  <?php if ($step === 2): ?>
  <form method="post" class="stack" autocomplete="off">
    <?php echo csrf_field(); ?>
    <div>
      <label for="code">6-digit code from your authenticator app</label>
      <input id="code" type="text" name="code" required autofocus inputmode="numeric" autocomplete="one-time-code" placeholder="123456 (or a recovery code)">
    </div>
    <button type="submit" class="gold">Verify and log in</button>
  </form>
  <form method="post" style="margin-top:10px"><?php echo csrf_field(); ?><input type="hidden" name="do" value="cancel"><button type="submit" class="linkbtn" style="color:var(--teal)">Back to password</button></form>
  <?php else: ?>
  <form method="post" class="stack" autocomplete="on">
    <?php echo csrf_field(); ?>
    <div>
      <label for="username">Username</label>
      <input id="username" type="text" name="username" value="<?php echo e($username); ?>" required autofocus autocomplete="username">
    </div>
    <div>
      <label for="password">Password</label>
      <div class="passwrap">
        <input id="password" type="password" name="password" required autocomplete="current-password">
        <button type="button" data-toggle-pass="password" aria-pressed="false">Show</button>
      </div>
    </div>
    <button type="submit" class="gold">Log in</button>
  </form>
  <?php endif; ?>
  <?php if (unclaimed_admin_exists()): ?><div class="login-foot"><a href="/dashboard/setup">First time here? Claim the account with your setup code</a></div><?php endif; ?>
  <div class="login-foot">Private area. Authorised use only.</div>
</main>
</body>
</html>
