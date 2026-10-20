<?php
require_once __DIR__ . '/includes/auth.php';
ensure_default_admin();

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $pdo = get_db();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($user && password_verify($password, $user['password_hash'])) {
        $_SESSION['user'] = ['id' => $user['id'], 'username' => $user['username']];
        header('Location: /dashboard/index.php');
        exit;
    }
    $error = 'Incorrect username or password.';
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login | Nibaha Haq Dashboard</title>
<meta name="robots" content="noindex, nofollow">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4F8FD;font-family:system-ui,sans-serif}
  .box{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:32px;width:100%;max-width:340px}
  h1{font-size:20px;margin:0 0 20px}
  label{font-size:13px;font-weight:600;color:#64748b;display:block;margin-bottom:4px}
  input{width:100%;padding:9px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px;margin-bottom:14px;box-sizing:border-box}
  button{width:100%;background:#2563eb;color:#fff;border:none;padding:10px;border-radius:6px;font-size:14px;cursor:pointer}
  .error{background:#fee2e2;color:#dc2626;padding:10px;border-radius:6px;font-size:13px;margin-bottom:14px}
</style>
</head>
<body>
<div class="box">
  <h1>Dashboard Login</h1>
  <?php if ($error): ?><div class="error"><?php echo htmlspecialchars($error); ?></div><?php endif; ?>
  <form method="post">
    <label>Username</label>
    <input type="text" name="username" required autofocus>
    <label>Password</label>
    <input type="password" name="password" required>
    <button type="submit">Login</button>
  </form>
</div>
</body>
</html>
