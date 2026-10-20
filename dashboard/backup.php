<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
require_once __DIR__ . '/includes/backup.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    if ($do === 'create') {
        flash('Backup saved on the server: ' . make_backup());
        redirect('/dashboard/backup.php');
    }
    if ($do === 'download') {
        $name = make_backup();
        $path = backup_dir() . '/' . $name;
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    if ($do === 'get') {
        $name = basename((string)($_POST['name'] ?? ''));
        $path = backup_dir() . '/' . $name;
        if (preg_match('/^dashboard-\d{8}-\d{6}\.sqlite$/', $name) && is_file($path)) {
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . $name . '"');
            header('Content-Length: ' . filesize($path));
            readfile($path);
            exit;
        }
        flash('Backup not found.', 'err');
        redirect('/dashboard/backup.php');
    }
}

$pageTitle = 'Backup';
$page = 'backup';
$backups = list_backups();
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card" style="max-width:760px">
  <div class="card-head"><h2>Database backup</h2></div>
  <p class="muted" style="margin-top:0">All clients, orders and activity live in one database file. Keep a copy on your own computer or Google Drive, so nothing is lost if the hosting has a problem.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <form method="post"><?php echo csrf_field(); ?><input type="hidden" name="do" value="download"><button type="submit" class="gold">Download backup now</button></form>
    <form method="post"><?php echo csrf_field(); ?><input type="hidden" name="do" value="create"><button type="submit" class="ghost">Save a copy on the server</button></form>
  </div>
</section>
<section class="card" style="max-width:760px">
  <div class="card-head"><h2>Server copies (latest <?php echo BACKUP_KEEP; ?> are kept)</h2></div>
  <?php if (!$backups): ?><div class="empty">No server copies yet. A daily cron job can create them automatically.</div><?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>File</th><th>Created</th><th class="num">Size</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($backups as $b): ?>
      <tr><td><?php echo e($b['name']); ?></td><td><?php echo e(date('Y-m-d H:i', $b['time'])); ?></td><td class="num"><?php echo e(number_format($b['size'] / 1024, 1)); ?> KB</td>
        <td><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="get"><input type="hidden" name="name" value="<?php echo e($b['name']); ?>"><button type="submit" class="ghost sm">Download</button></form></td></tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
