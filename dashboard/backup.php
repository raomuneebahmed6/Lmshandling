<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
require_once __DIR__ . '/includes/backup.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    if ($do === 'create') {
        flash('Backup saved on the server: ' . make_backup());
        redirect('/dashboard/backup');
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
    if ($do === 'files_zip') {
        if (!class_exists('ZipArchive')) { flash('This server cannot make zip files.', 'err'); redirect('/dashboard/backup'); }
        $rows = get_db()->query('SELECT f.*, c.name AS cname FROM client_files f JOIN clients c ON c.id = f.client_id WHERE f.deleted_at IS NULL ORDER BY f.id')->fetchAll(PDO::FETCH_ASSOC);
        $tmp = tempnam(sys_get_temp_dir(), 'lmhz');
        $zip = new ZipArchive();
        $zip->open($tmp, ZipArchive::OVERWRITE);
        $n = 0;
        foreach ($rows as $r) {
            $p = private_path('files') . '/' . basename($r['stored_name']);
            if (!is_file($p)) continue;
            $raw = (string)file_get_contents($p);
            $data = $r['enc'] ? file_decrypt_bytes($raw) : $raw;
            if ($data === false) continue;
            $folder = preg_replace('/[^\p{L}\p{N} _-]+/u', '_', $r['cname']) . ' (client ' . (int)$r['client_id'] . ')';
            $zip->addFromString($folder . '/' . (int)$r['id'] . ' - ' . $r['name'], $data);
            $n++;
        }
        $zip->close();
        audit('files backup downloaded', $n . ' file(s)');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="pdf-files-' . date('Ymd-His') . '.zip"');
        header('Content-Length: ' . filesize($tmp));
        readfile($tmp);
        @unlink($tmp);
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
        redirect('/dashboard/backup');
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
  <div class="card-head"><h2>PDF files backup</h2></div>
  <p class="muted" style="margin-top:0">Downloads every saved PDF as one zip, with a folder per client. The zip is not encrypted, so keep it somewhere private.</p>
  <form method="post"><?php echo csrf_field(); ?><input type="hidden" name="do" value="files_zip"><button type="submit" class="ghost">Download all PDFs (zip)</button></form>
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
