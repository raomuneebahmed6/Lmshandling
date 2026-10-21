<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();
$me = current_user()['id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    $uid = (int)($_POST['id'] ?? 0);

    if ($do === 'add') {
        $username = strtolower(trim($_POST['username'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        $role = ($_POST['role'] ?? 'staff') === 'admin' ? 'admin' : 'staff';
        if (!preg_match('/^[a-z0-9._-]{3,30}$/', $username)) {
            flash('Username must be 3-30 letters, numbers, dot, dash or underscore.', 'err');
        } elseif (strlen($password) < 10 || $password === DEFAULT_ADMIN_PASSWORD) {
            flash('Password must be at least 10 characters.', 'err');
        } else {
            try {
                $pdo->prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)')->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role]);
                flash('User "' . $username . '" created. Share the password privately and ask them to change it.');
            } catch (PDOException $ex) {
                flash('That username already exists.', 'err');
            }
        }
    } elseif ($uid && $uid !== $me && in_array($do, ['deactivate', 'activate', 'role_admin', 'role_staff'], true)) {
        if ($do === 'deactivate') $pdo->prepare('UPDATE users SET active = 0 WHERE id = ?')->execute([$uid]);
        if ($do === 'activate') $pdo->prepare('UPDATE users SET active = 1 WHERE id = ?')->execute([$uid]);
        if ($do === 'role_admin') $pdo->prepare("UPDATE users SET role = 'admin' WHERE id = ?")->execute([$uid]);
        if ($do === 'role_staff') $pdo->prepare("UPDATE users SET role = 'staff' WHERE id = ?")->execute([$uid]);
        flash('User updated.');
    } elseif ($do === 'reset' && $uid) {
        $password = (string)($_POST['password'] ?? '');
        if (strlen($password) < 10 || $password === DEFAULT_ADMIN_PASSWORD) {
            flash('Password must be at least 10 characters.', 'err');
        } else {
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $uid]);
            flash('Password reset.');
        }
    } elseif ($do === 'reset2fa' && $uid) {
        $pdo->prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL WHERE id = ?')->execute([$uid]);
        flash('Two-step login cleared for that user.');
    }
    redirect('/dashboard/users.php');
}

$users = $pdo->query('SELECT * FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$pageTitle = 'Team';
$page = 'users';
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <div class="card-head"><h2>Accounts</h2></div>
  <div class="tablewrap"><table>
    <thead><tr><th>User</th><th>Role</th><th>2-step</th><th>Status</th><th>Added</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($users as $u): $self = (int)$u['id'] === (int)$me; ?>
      <tr>
        <td><strong><?php echo e($u['username']); ?></strong><?php echo $self ? ' <span class="muted">(you)</span>' : ''; ?></td>
        <td><span class="badge b-<?php echo $u['role'] === 'admin' ? 'completed' : 'lead'; ?>"><?php echo e($u['role']); ?></span></td>
        <td><?php echo $u['totp_enabled'] ? '<span class="badge b-paid">ON</span>' : '<span class="muted">off</span>'; ?></td>
        <td><span class="badge b-<?php echo $u['active'] ? 'paid' : 'unpaid'; ?>"><?php echo $u['active'] ? 'active' : 'disabled'; ?></span></td>
        <td><?php echo e(substr($u['created_at'], 0, 10)); ?></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <?php if (!$self): ?>
            <form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="id" value="<?php echo (int)$u['id']; ?>">
              <?php if ($u['active']): ?><button name="do" value="deactivate" class="ghost sm">Disable</button><?php else: ?><button name="do" value="activate" class="ghost sm">Enable</button><?php endif; ?>
              <button name="do" value="<?php echo $u['role'] === 'admin' ? 'role_staff' : 'role_admin'; ?>" class="ghost sm">Make <?php echo $u['role'] === 'admin' ? 'staff' : 'admin'; ?></button>
              <?php if ($u['totp_enabled']): ?><button name="do" value="reset2fa" class="ghost sm">Clear 2-step</button><?php endif; ?>
            </form>
          <?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <p class="muted" style="margin-bottom:0">Staff can add and edit clients, orders and payments. Only admins can delete records, see backups, reports of money, and manage the team.</p>
</section>

<div class="grid2">
<section class="card">
  <div class="card-head"><h2>Add a team member</h2></div>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="add">
    <div class="row2">
      <div><label for="nu">Username</label><input id="nu" name="username" required pattern="[A-Za-z0-9._-]{3,30}" autocomplete="off"></div>
      <div><label for="nr">Role</label><select id="nr" name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>
    </div>
    <div><label for="npw">Temporary password (10+ characters)</label><div class="passwrap"><input id="npw" type="password" name="password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="npw" aria-pressed="false">Show</button></div></div>
    <div><button type="submit" class="gold">Create account</button></div>
  </form>
</section>
<section class="card">
  <div class="card-head"><h2>Reset someone's password</h2></div>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="reset">
    <div><label for="ru">Account</label><select id="ru" name="id"><?php foreach ($users as $u): ?><option value="<?php echo (int)$u['id']; ?>"><?php echo e($u['username']); ?></option><?php endforeach; ?></select></div>
    <div><label for="rp">New password (10+ characters)</label><div class="passwrap"><input id="rp" type="password" name="password" required minlength="10" autocomplete="new-password"><button type="button" data-toggle-pass="rp" aria-pressed="false">Show</button></div></div>
    <div><button type="submit" class="ghost">Reset password</button></div>
  </form>
</section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
