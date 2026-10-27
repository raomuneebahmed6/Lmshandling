<?php
// PDF library: upload PDFs against a client, find and open them again. Files are stored encrypted in the
// private folder (never inside the public web folder) and can only be opened by a logged-in team member.
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

const FILE_MAX_BYTES = 15 * 1024 * 1024;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    if ($do === 'upload') {
        $cid = (int)($_POST['client_id'] ?? 0);
        $chk = $pdo->prepare('SELECT id FROM clients WHERE id = ?'); $chk->execute([$cid]);
        if (!$chk->fetchColumn()) { flash('Choose a client for the file.', 'err'); redirect('/dashboard/files'); }
        $note = mb_substr(trim((string)($_POST['note'] ?? '')), 0, 200);
        $names = $_FILES['pdf']['name'] ?? [];
        if (!is_array($names)) $names = [];
        $done = 0; $bad = [];
        $ins = $pdo->prepare('INSERT INTO client_files (client_id, name, stored_name, size, enc, note, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?)');
        $dir = private_path('files');
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        foreach ($names as $i => $orig) {
            if ($orig === '' || ($_FILES['pdf']['error'][$i] ?? 1) === UPLOAD_ERR_NO_FILE) continue;
            $tmp = $_FILES['pdf']['tmp_name'][$i] ?? '';
            if (($_FILES['pdf']['error'][$i] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file($tmp)) { $bad[] = $orig . ' (upload failed)'; continue; }
            $size = (int)filesize($tmp);
            if ($size < 8 || $size > FILE_MAX_BYTES) { $bad[] = $orig . ' (over 15 MB or empty)'; continue; }
            $data = (string)file_get_contents($tmp);
            if (strpos(substr($data, 0, 1024), '%PDF-') === false) { $bad[] = $orig . ' (not a PDF)'; continue; }
            $clean = preg_replace('/[^\p{L}\p{N} ._()\-]+/u', '_', basename(str_replace('\\', '/', $orig)));
            $clean = mb_substr(trim($clean, " ._"), 0, 120);
            if (!preg_match('/\.pdf$/i', $clean)) $clean .= '.pdf';
            $stored = bin2hex(random_bytes(16)) . '.bin';
            $enc = crypto_available() ? 1 : 0;
            $blob = $enc ? file_encrypt_bytes($data) : $data;
            if (@file_put_contents($dir . '/' . $stored, $blob) === false) { $bad[] = $orig . ' (could not be saved)'; continue; }
            @chmod($dir . '/' . $stored, 0600);
            $ins->execute([$cid, $clean, $stored, $size, $enc, $note, current_user()['username'] ?? '', time()]);
            $done++;
            audit('file uploaded', $clean . ' (client #' . $cid . ')');
        }
        if ($done) flash($done . ' PDF' . ($done > 1 ? 's' : '') . ' saved.' . ($bad ? ' Skipped: ' . implode(', ', $bad) : ''));
        else flash('Nothing was saved. ' . ($bad ? implode(', ', $bad) : 'Choose one or more PDF files.'), 'err');
        redirect('/dashboard/files' . ($cid ? '?client=' . $cid : ''));
    } elseif ($do === 'delete' && is_admin()) {
        $fid = (int)($_POST['id'] ?? 0);
        $pdo->prepare('UPDATE client_files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')->execute([time(), $fid]);
        audit('file removed', 'file #' . $fid);
        flash('File removed from the list. The encrypted copy is kept on the server.');
        redirect('/dashboard/files');
    } elseif ($do === 'rename') {
        $fid = (int)($_POST['id'] ?? 0);
        $note = mb_substr(trim((string)($_POST['note'] ?? '')), 0, 200);
        $pdo->prepare('UPDATE client_files SET note = ? WHERE id = ? AND deleted_at IS NULL')->execute([$note, $fid]);
        flash('Note saved.');
        redirect('/dashboard/files');
    }
}

$q = trim($_GET['q'] ?? '');
$cf = (int)($_GET['client'] ?? 0);
$where = ['f.deleted_at IS NULL']; $params = [];
if ($cf) { $where[] = 'f.client_id = ?'; $params[] = $cf; }
if ($q !== '') { $where[] = '(f.name LIKE ? OR f.note LIKE ? OR c.name LIKE ? OR c.vu_id LIKE ?)'; $l = '%' . $q . '%'; array_push($params, $l, $l, $l, $l); }
$s = $pdo->prepare('SELECT f.*, c.name AS client_name, c.vu_id FROM client_files f JOIN clients c ON c.id = f.client_id WHERE ' . implode(' AND ', $where) . ' ORDER BY f.created_at DESC, f.id DESC LIMIT 300');
$s->execute($params);
$files = $s->fetchAll(PDO::FETCH_ASSOC);
$clients = $pdo->query('SELECT id, name, vu_id FROM clients ORDER BY lower(name)')->fetchAll(PDO::FETCH_ASSOC);
$total = (int)$pdo->query('SELECT COUNT(*) FROM client_files WHERE deleted_at IS NULL')->fetchColumn();

$pageTitle = 'Files';
$page = 'files';
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <div class="card-head"><h2>Upload PDFs</h2><span class="muted"><?php echo $total; ?> file<?php echo $total === 1 ? '' : 's'; ?> saved</span></div>
  <form method="post" enctype="multipart/form-data" class="stack" style="max-width:640px">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="upload">
    <div class="row2">
      <div><label for="fc">Client</label>
        <select id="fc" name="client_id" required><option value="">Choose a client</option>
          <?php foreach ($clients as $c): ?><option value="<?php echo (int)$c['id']; ?>"<?php echo $cf === (int)$c['id'] ? ' selected' : ''; ?>><?php echo e($c['name'] . ($c['vu_id'] ? ' (' . $c['vu_id'] . ')' : '')); ?></option><?php endforeach; ?></select></div>
      <div><label for="fn">Note (optional)</label><input id="fn" name="note" maxlength="200" placeholder="e.g. CS101 handout, receipt"></div>
    </div>
    <div><label for="fp">PDF files (up to 15 MB each, several at once)</label><input id="fp" type="file" name="pdf[]" accept="application/pdf,.pdf" multiple required></div>
    <div><button type="submit" class="gold">Upload</button></div>
  </form>
</section>

<section class="card">
  <div class="card-head"><h2>All files</h2>
    <form method="get" class="inline" style="display:flex;gap:8px"><?php if ($cf): ?><input type="hidden" name="client" value="<?php echo $cf; ?>"><?php endif; ?>
      <input type="search" name="q" value="<?php echo e($q); ?>" placeholder="Search file, client, VU ID" aria-label="Search files"><button class="ghost sm" type="submit">Search</button></form></div>
  <?php if ($cf): ?><p class="muted" style="margin-top:0">Showing one client's files. <a href="/dashboard/files">Show all</a></p><?php endif; ?>
  <?php if (!$files): ?><div class="empty">No files yet.</div><?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>File</th><th>Client</th><th>Note</th><th class="num">Size</th><th>Added</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($files as $f): ?>
      <tr>
        <td><a href="/dashboard/file_get?id=<?php echo (int)$f['id']; ?>" target="_blank" rel="noopener"><?php echo e($f['name']); ?></a></td>
        <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$f['client_id']; ?>"><?php echo e($f['client_name']); ?></a></td>
        <td><?php echo e($f['note'] ?: '-'); ?></td>
        <td class="num"><?php echo e(human_size((int)$f['size'])); ?></td>
        <td><?php echo e(date('Y-m-d', (int)$f['created_at'])); ?><br><span class="muted"><?php echo e($f['uploaded_by']); ?></span></td>
        <td style="white-space:nowrap">
          <a class="btn ghost sm" href="/dashboard/file_get?id=<?php echo (int)$f['id']; ?>&amp;dl=1">Download</a>
          <?php if (is_admin()): ?><form method="post" class="inline" data-confirm="Remove this file from the list?"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo (int)$f['id']; ?>"><button class="danger sm" type="submit">Remove</button></form><?php endif; ?>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
