<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$report = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $f = $_FILES['csv'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || $f['size'] > 1024 * 1024) {
        flash('Choose a CSV file smaller than 1 MB.', 'err');
        redirect('/dashboard/import.php');
    }
    $fh = fopen($f['tmp_name'], 'r');
    $first = fgets($fh);
    rewind($fh);
    $delim = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
    $rows = [];
    while (($r = fgetcsv($fh, 0, $delim)) !== false) {
        if (count($rows) > 2000) break;
        $rows[] = $r;
    }
    fclose($fh);
    if ($rows) $rows[0][0] = preg_replace('/^\xEF\xBB\xBF/', '', (string)$rows[0][0]);

    // header row: find columns by name (name, whatsapp/phone/number, course/program, source, tags, notes)
    $map = ['name' => 0, 'phone' => 1, 'course' => 2, 'source' => 3, 'tags' => 4, 'notes' => 5];
    $hdr = array_map(fn($x) => strtolower(trim((string)$x)), $rows[0] ?? []);
    if (in_array('name', $hdr, true) || in_array('whatsapp', $hdr, true) || in_array('phone', $hdr, true)) {
        $find = function ($names) use ($hdr) { foreach ($names as $n) { $i = array_search($n, $hdr, true); if ($i !== false) return $i; } return null; };
        $map = ['name' => $find(['name', 'client', 'full name']), 'phone' => $find(['whatsapp', 'phone', 'number', 'mobile', 'whatsapp number']),
            'course' => $find(['course', 'program', 'course / program']), 'source' => $find(['source']), 'tags' => $find(['tags', 'tag']), 'notes' => $find(['notes', 'note'])];
        array_shift($rows);
    }
    $added = 0; $skipped = []; $seen = [];
    $ins = $pdo->prepare("INSERT INTO clients (name, whatsapp_number, course, source, notes, stage, tags) VALUES (?,?,?,?,?,'lead',?)");
    $pdo->beginTransaction();
    foreach ($rows as $n => $r) {
        $get = fn($k) => ($map[$k] !== null && isset($r[$map[$k]])) ? trim((string)$r[$map[$k]]) : '';
        $name = mb_substr($get('name'), 0, 120);
        $phone = $get('phone');
        if ($name === '') { if (array_filter($r)) $skipped[] = 'Row ' . ($n + 2) . ': no name'; continue; }
        $norm = wa_number($phone);
        if ($norm !== '' && (isset($seen[$norm]) || find_client_by_phone($pdo, $phone))) { $skipped[] = $name . ': number already exists'; continue; }
        if ($norm !== '') $seen[$norm] = 1;
        $ins->execute([$name, $phone, mb_substr($get('course'), 0, 120), mb_substr($get('source') ?: 'Import', 0, 60), mb_substr($get('notes'), 0, 1000), clean_tags($get('tags'))]);
        $added++;
    }
    $pdo->commit();
    audit('clients imported', $added . ' added, ' . count($skipped) . ' skipped');
    $report = ['added' => $added, 'skipped' => $skipped];
}

$pageTitle = 'Import clients';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if ($report): ?>
<div class="msg msg-ok"><?php echo (int)$report['added']; ?> client(s) added as leads. <?php echo count($report['skipped']); ?> skipped.</div>
<?php if ($report['skipped']): ?><section class="card"><div class="card-head"><h2>Skipped</h2></div><ul class="list"><?php foreach (array_slice($report['skipped'], 0, 40) as $s): ?><li><?php echo e($s); ?></li><?php endforeach; ?></ul></section><?php endif; ?>
<?php endif; ?>
<section class="card" style="max-width:680px">
  <div class="card-head"><h2>Import clients from a CSV file</h2></div>
  <p class="muted" style="margin-top:0">Export your contacts from Excel or Google Sheets as CSV. The first row can have these headings: <strong>name, whatsapp, course, source, tags, notes</strong>. Only <em>name</em> is required. Numbers that already exist (even written differently, like 0300-1234567 and +92 300 1234567) are skipped. New clients come in as <em>Leads</em>.</p>
  <form method="post" enctype="multipart/form-data" class="stack">
    <?php echo csrf_field(); ?>
    <div><label for="csv">CSV file</label><input id="csv" type="file" name="csv" accept=".csv,text/csv" required></div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Import</button><a class="btn ghost" href="/dashboard/clients.php">Back to clients</a></div>
  </form>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
