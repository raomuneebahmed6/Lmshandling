<?php
require_once __DIR__ . '/includes/auth.php';
ensure_default_admin();

if (current_user()) {
    redirect('/dashboard/index.php');
}

$error = '';
$username = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $username = trim($_POST['username'] ?? '');
    $password = (string)($_POST['password'] ?? '');
    if (login_blocked($username)) {
        $error = 'Too many attempts. Please wait 15 minutes and try again.';
    } else {
        $stmt = get_db()->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user && password_verify($password, $user['password_hash'])) {
            login_success($user);
            redirect($_SESSION['default_pw'] ? '/dashboard/change_password.php' : '/dashboard/index.php');
        }
        login_failed($username);
        $error = 'Incorrect username or password.';
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=3">
<script src="/dashboard/assets/dash.js?v=2" defer></script>
</head>
<body class="login">
<main class="login-card">
  <div class="logo">
    <img src="/assets/logo.webp" alt="" width="52" height="52">
    <div><h1>Welcome back</h1><p>Nibaha Haq &middot; Client CRM</p></div>
  </div>
  <?php if ($error): ?><div class="msg msg-err" role="alert"><?php echo e($error); ?></div><?php endif; ?>
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
  <div class="login-foot">Private area. Authorised use only.</div>
</main>
</body>
</html>
