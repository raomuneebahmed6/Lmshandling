<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

// Parse a .vcf (vCard) contact export (phone contacts, Google Contacts, iCloud) into name + phone records.
function parse_vcf($text) {
    $text = preg_replace("/\r\n|\r/", "\n", $text);
    $text = preg_replace("/\n[ \t]/", '', $text); // unfold long lines
    $out = [];
    foreach (preg_split('/BEGIN:VCARD/i', $text) as $card) {
        if (!preg_match('/END:VCARD/i', $card)) continue;
        $name = ''; $tel = ''; $org = ''; $note = '';
        foreach (explode("\n", $card) as $line) {
            if (!strpos($line, ':')) continue;
            [$k, $v] = explode(':', $line, 2);
            $key = strtoupper(explode(';', $k)[0]);
            if (stripos($k, 'QUOTED-PRINTABLE') !== false) $v = quoted_printable_decode($v);
            $v = trim(str_replace(['\\,', '\\;', '\\n'], [',', ';', ' '], $v));
            if ($key === 'FN' && $name === '') $name = $v;
            elseif ($key === 'N' && $name === '') $name = trim(preg_replace('/\s+/', ' ', str_replace(';', ' ', $v)));
            elseif ($key === 'TEL' && $tel === '') $tel = $v;
            elseif ($key === 'ORG' && $org === '') $org = trim(str_replace(';', ' ', $v));
            elseif ($key === 'NOTE' && $note === '') $note = $v;
        }
        if ($name !== '' || $tel !== '') $out[] = ['name' => $name, 'phone' => $tel, 'course' => $org, 'source' => '', 'tags' => '', 'notes' => $note];
    }
    return $out;
}

// Parse a CSV: our own template, Google Contacts, Outlook or any sheet with a header row.
function parse_csv_rows($path) {
    $fh = fopen($path, 'r');
    $first = fgets($fh);
    rewind($fh);
    $delim = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
    $rows = [];
    while (($r = fgetcsv($fh, 0, $delim)) !== false) {
        if (count($rows) > 5000) break;
        $rows[] = $r;
    }
    fclose($fh);
    if (!$rows) return [];
    $rows[0][0] = preg_replace('/^\xEF\xBB\xBF/', '', (string)$rows[0][0]);
    $hdr = array_map(fn($x) => strtolower(trim((string)$x)), $rows[0]);
    $find = function ($names) use ($hdr) { foreach ($names as $n) { $i = array_search($n, $hdr, true); if ($i !== false) return $i; } return null; };
    $hasHeader = $find(['name', 'full name', 'client', 'first name', 'given name', 'display name', 'whatsapp', 'phone', 'phone 1 - value', 'mobile phone', 'mobile']) !== null;
    if (!$hasHeader) {
        $map = ['name' => 0, 'phone' => 1, 'course' => 2, 'source' => 3, 'tags' => 4, 'notes' => 5, 'first' => null, 'last' => null];
    } else {
        $map = [
            'name' => $find(['name', 'full name', 'client', 'display name']),
            'first' => $find(['first name', 'given name']),
            'last' => $find(['last name', 'family name', 'surname']),
            'phone' => $find(['whatsapp', 'whatsapp number', 'phone', 'phone 1 - value', 'mobile phone', 'primary phone', 'mobile', 'number', 'tel', 'phone number']),
            'course' => $find(['course', 'program', 'course / program', 'organization 1 - name', 'company']),
            'source' => $find(['source']), 'tags' => $find(['tags', 'tag', 'labels']), 'notes' => $find(['notes', 'note']),
        ];
        array_shift($rows);
    }
    $out = [];
    foreach ($rows as $r) {
        $g = fn($k) => (isset($map[$k]) && $map[$k] !== null && isset($r[$map[$k]])) ? trim((string)$r[$map[$k]]) : '';
        $name = $g('name') !== '' ? $g('name') : trim($g('first') . ' ' . $g('last'));
        $out[] = ['name' => $name, 'phone' => $g('phone'), 'course' => $g('course'), 'source' => $g('source'), 'tags' => str_replace(' ::: ', ', ', $g('tags')), 'notes' => $g('notes')];
    }
    return $out;
}

$report = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $f = $_FILES['csv'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || $f['size'] > 5 * 1024 * 1024) {
        flash('Choose a .csv or .vcf file smaller than 5 MB.', 'err');
        redirect('/dashboard/import.php');
    }
    $isVcf = preg_match('/\.vcf$/i', $f['name']) || stripos((string)file_get_contents($f['tmp_name'], false, null, 0, 20), 'BEGIN:VCARD') === 0;
    $records = $isVcf ? parse_vcf((string)file_get_contents($f['tmp_name'])) : parse_csv_rows($f['tmp_name']);
    $records = array_slice($records, 0, 5000);

    $source = trim($_POST['source'] ?? '');
    $tag = clean_tags($_POST['tag'] ?? '');
    $added = 0; $skipped = []; $seen = [];
    $ins = $pdo->prepare("INSERT INTO clients (name, whatsapp_number, course, source, notes, stage, tags) VALUES (?,?,?,?,?,'lead',?)");
    $pdo->beginTransaction();
    foreach ($records as $n => $r) {
        $name = mb_substr($r['name'], 0, 120);
        $phone = $r['phone'];
        if ($name === '') { $name = $phone; }
        if ($name === '') continue;
        $norm = wa_number($phone);
        if ($norm !== '' && strlen($norm) < 10) { $skipped[] = $name . ': number looks too short'; continue; }
        if ($norm !== '' && (isset($seen[$norm]) || find_client_by_phone($pdo, $phone))) { $skipped[] = $name . ': number already exists'; continue; }
        if ($norm !== '') $seen[$norm] = 1;
        $tags = clean_tags(trim($r['tags'] . ',' . $tag, ','));
        $ins->execute([$name, $phone, mb_substr($r['course'], 0, 120), mb_substr($r['source'] !== '' ? $r['source'] : ($source !== '' ? $source : 'Import'), 0, 60), mb_substr($r['notes'], 0, 1000), $tags]);
        $added++;
    }
    $pdo->commit();
    audit('clients imported', ($isVcf ? 'vcf' : 'csv') . ': ' . $added . ' added, ' . count($skipped) . ' skipped');
    $report = ['added' => $added, 'skipped' => $skipped];
}

$pageTitle = 'Import clients';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if ($report): ?>
<div class="msg msg-ok"><?php echo (int)$report['added']; ?> client(s) added as leads. <?php echo count($report['skipped']); ?> skipped.</div>
<?php if ($report['skipped']): ?><section class="card"><div class="card-head"><h2>Skipped</h2></div><ul class="list"><?php foreach (array_slice($report['skipped'], 0, 60) as $s): ?><li><?php echo e($s); ?></li><?php endforeach; ?></ul></section><?php endif; ?>
<?php endif; ?>
<div class="grid2">
<section class="card">
  <div class="card-head"><h2>Import contacts</h2></div>
  <p class="muted" style="margin-top:0">Upload a <strong>.vcf</strong> (phone contacts export) or a <strong>.csv</strong> (Google Contacts, Excel, Sheets). Names and phone numbers are read automatically. Numbers that already exist (even written differently, like 0300-1234567 and +92 300 1234567) are skipped. New people come in as <em>Leads</em>.</p>
  <form method="post" enctype="multipart/form-data" class="stack">
    <?php echo csrf_field(); ?>
    <div><label for="csv">Contacts file (.vcf or .csv, up to 5 MB)</label><input id="csv" type="file" name="csv" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard" required></div>
    <div class="row2">
      <div><label for="src">Source for everyone in this file</label><input id="src" name="source" placeholder="e.g. WhatsApp" value="WhatsApp"></div>
      <div><label for="tg">Tag for everyone in this file</label><input id="tg" name="tag" placeholder="e.g. old-students"></div>
    </div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Import</button><a class="btn ghost" href="/dashboard/clients.php">Back to clients</a></div>
  </form>
</section>
<section class="card">
  <div class="card-head"><h2>How to get your WhatsApp contacts out</h2></div>
  <ol class="steps">
    <li><strong>Android:</strong> Contacts app &rarr; menu &rarr; Export contacts &rarr; .vcf file. Or open contacts.google.com &rarr; Export &rarr; "Google CSV".</li>
    <li><strong>iPhone:</strong> icloud.com/contacts &rarr; select all &rarr; Export vCard.</li>
    <li>Upload the file here. Only names and numbers are copied; chats and photos are not.</li>
  </ol>
  <p class="muted" style="margin-bottom:0">Tip: tag the file (for example <em>fall-2026</em>) so you can filter these people later in Clients.</p>
</section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
