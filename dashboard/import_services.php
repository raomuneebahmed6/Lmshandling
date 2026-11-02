<?php
// Import services from a CSV: one row = one service of one client (plan, amount, received so far, notes).
// Clients are matched by VU ID, then by exact name; a client that does not exist yet is created.
// A row that was already imported (same client, service and notes) is skipped, so a file can be run twice safely.
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

function isv_tags($tags) { return array_values(array_filter(array_map('trim', explode(',', (string)$tags)), fn($t) => $t !== '')); }

function isv_with_pay($tags, $status) {
    $keep = array_filter(isv_tags($tags), fn($t) => !in_array(strtolower($t), ['paid', 'unpaid', 'payment-unknown'], true));
    if (in_array($status, ['paid', 'unpaid'], true)) $keep[] = $status;
    return clean_tags(implode(',', $keep));
}

$report = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $f = $_FILES['csv'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || $f['size'] > 5 * 1024 * 1024) {
        flash('Choose a .csv file smaller than 5 MB.', 'err');
        redirect('/dashboard/import_services');
    }
    $fh = fopen($f['tmp_name'], 'r');
    $first = (string)fgets($fh);
    rewind($fh);
    $delim = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
    $rows = [];
    while (($r = fgetcsv($fh, 0, $delim)) !== false && count($rows) <= 3000) $rows[] = $r;
    fclose($fh);
    if (!$rows) { flash('The file is empty.', 'err'); redirect('/dashboard/import_services'); }
    $rows[0][0] = preg_replace('/^\xEF\xBB\xBF/', '', (string)$rows[0][0]);
    $hdr = array_map(fn($x) => strtolower(trim((string)$x)), array_shift($rows));
    $col = function ($names) use ($hdr) { foreach ($names as $n) { $i = array_search($n, $hdr, true); if ($i !== false) return $i; } return null; };
    $map = [
        'name' => $col(['name', 'student name', 'client']), 'vu' => $col(['vu id', 'vu_id', 'account id', 'student id']),
        'service' => $col(['service', 'file type']), 'plan' => $col(['plan']), 'amount' => $col(['amount', 'total']),
        'paid' => $col(['paid', 'received', 'amount received']), 'fee' => $col(['monthly fee', 'monthly_fee']), 'months' => $col(['months']),
        'start' => $col(['start date', 'start']), 'end' => $col(['end date', 'end']), 'course' => $col(['course', 'course code']),
        'notes' => $col(['notes', 'note', 'details']), 'status' => $col(['status']),
    ];
    if ($map['name'] === null && $map['vu'] === null) { flash('The file needs a "name" or "vu id" column.', 'err'); redirect('/dashboard/import_services'); }
    $g = function ($r, $k) use ($map) { return ($map[$k] !== null && isset($r[$map[$k]])) ? trim((string)$r[$map[$k]]) : ''; };
    $num = function ($v) { $v = preg_replace('/[^0-9.]/', '', (string)$v); return $v === '' ? null : max(0, (float)$v); };
    $tag = clean_tags($_POST['tag'] ?? '');
    $newClients = 0; $added = 0; $dups = 0; $skipped = []; $check = 0;
    $byName = $pdo->prepare('SELECT id FROM clients WHERE lower(name) = ?');
    $pdo->beginTransaction();
    foreach ($rows as $i => $r) {
        $name = mb_substr($g($r, 'name'), 0, 120);
        $vu = clean_vu_id($g($r, 'vu'));
        if ($name === '' && $vu === '') continue;
        $status = strtolower($g($r, 'status'));
        $status = $status === 'paid' ? 'paid' : ($status === 'unpaid' ? 'unpaid' : '');
        $client = $vu !== '' ? find_client_by_vu_id($pdo, $vu) : null;
        $cid = $client ? (int)$client['id'] : 0;
        if (!$cid && $name !== '') {
            $byName->execute([mb_strtolower($name)]);
            $ids = $byName->fetchAll(PDO::FETCH_COLUMN);
            if (count($ids) === 1) $cid = (int)$ids[0];
            elseif (count($ids) > 1) { $skipped[] = ($i + 2) . ': ' . $name . ' (several clients have this name, add the VU ID)'; continue; }
        }
        if (!$cid) {
            $pdo->prepare("INSERT INTO clients (name, source, stage, tags, vu_id) VALUES (?,?,?,?,?)")
                ->execute([$name !== '' ? $name : $vu, 'Import', 'active', isv_with_pay($tag, $status), $vu]);
            $cid = (int)$pdo->lastInsertId();
            $newClients++;
        } elseif ($status !== '' || $tag !== '') {
            $cur = $pdo->prepare('SELECT tags FROM clients WHERE id = ?'); $cur->execute([$cid]);
            $tags = (string)$cur->fetchColumn();
            if ($tag !== '' && !in_array(strtolower($tag), array_map('strtolower', isv_tags($tags)), true)) $tags = clean_tags($tags . ',' . $tag);
            $pdo->prepare('UPDATE clients SET tags = ? WHERE id = ?')->execute([isv_with_pay($tags, $status), $cid]);
        }
        $service = mb_substr($g($r, 'service') !== '' ? $g($r, 'service') : 'LMS Handling', 0, 60);
        $plan = strtolower($g($r, 'plan'));
        if (!array_key_exists($plan, SERVICE_PLANS)) $plan = 'one-time';
        $notes = mb_substr($g($r, 'notes'), 0, 1000);
        $dup = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE client_id = ? AND file_type = ? AND COALESCE(notes, \'\') = ?');
        $dup->execute([$cid, $service, $notes]);
        if ($dup->fetchColumn()) { $dups++; continue; }
        $amount = $num($g($r, 'amount')); $paid = $num($g($r, 'paid')); $fee = $num($g($r, 'fee'));
        $months = $g($r, 'months') !== '' ? max(0, (int)$g($r, 'months')) : null;
        $start = valid_date($g($r, 'start')) ? $g($r, 'start') : null;
        $end = valid_date($g($r, 'end')) ? $g($r, 'end') : null;
        if ($plan === 'monthly' && $fee && $months && $amount === null) $amount = $fee * $months;
        if ($amount === null && $paid && $status === 'paid') $amount = $paid;
        if ($amount !== null && $paid !== null && $paid > $amount) $amount = $paid;
        $course = strtoupper(mb_substr(preg_replace('/[^A-Za-z0-9 \/-]/', '', $g($r, 'course')), 0, 40));
        $pdo->prepare('INSERT INTO orders (client_id, file_type, file_count, amount, status, notes, order_date, course_code, plan, start_date, end_date, monthly_fee, months) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$cid, $service, 0, $amount, 'pending', $notes, date('Y-m-d'), $course, $plan, $start, $end, $fee, $months]);
        $oid = (int)$pdo->lastInsertId();
        if ($paid && $paid > 0) add_payment($pdo, $oid, $paid, 'Other', date('Y-m-d'), 'Imported from your sheet');
        else recalc_order($pdo, $oid);
        $added++;
    }
    $pdo->commit();
    audit('services imported', $added . ' added, ' . $newClients . ' new clients, ' . $dups . ' already there');
    $report = ['added' => $added, 'clients' => $newClients, 'dups' => $dups, 'skipped' => $skipped];
}

$pageTitle = 'Import services';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if ($report): ?>
<div class="msg msg-ok"><?php echo (int)$report['added']; ?> service(s) added<?php echo $report['clients'] ? ', ' . (int)$report['clients'] . ' new client(s) created' : ''; ?><?php echo $report['dups'] ? ', ' . (int)$report['dups'] . ' skipped because they were already imported' : ''; ?>.</div>
<?php if ($report['skipped']): ?><section class="card"><div class="card-head"><h2>Not imported</h2></div><ul class="list"><?php foreach (array_slice($report['skipped'], 0, 60) as $s): ?><li><?php echo e($s); ?></li><?php endforeach; ?></ul></section><?php endif; ?>
<?php endif; ?>
<section class="card" style="max-width:760px">
  <div class="card-head"><h2>Import services (CSV)</h2><a class="btn ghost sm" href="/dashboard/import">Import contacts</a></div>
  <p class="muted" style="margin-top:0">One row per service. Columns the file can have: <strong>name</strong>, <strong>vu id</strong>, <strong>service</strong>, <strong>plan</strong> (one-time, monthly, midterm, finalterm, semester), <strong>amount</strong> (total), <strong>paid</strong> (received so far), <strong>monthly fee</strong>, <strong>months</strong>, <strong>start date</strong>, <strong>end date</strong>, <strong>course</strong>, <strong>status</strong> (paid / unpaid), <strong>notes</strong>. Clients are matched by VU ID or exact name; a new one is created if there is no match. Running the same file twice does not duplicate anything. Passwords are never read or stored.</p>
  <form method="post" enctype="multipart/form-data" class="stack">
    <?php echo csrf_field(); ?>
    <div><label for="isf">CSV file (up to 5 MB)</label><input id="isf" type="file" name="csv" accept=".csv,text/csv" required></div>
    <div><label for="ist">Tag for new clients / everyone in the file (optional)</label><input id="ist" name="tag" placeholder="e.g. mids-2026-27" style="max-width:300px"></div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Import services</button><a class="btn ghost" href="/dashboard/clients">Back to clients</a></div>
  </form>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
