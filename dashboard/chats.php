<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
require_once __DIR__ . '/includes/chat.php';
$pdo = get_db();

$report = [];
$target = (int)($_GET['client'] ?? $_POST['client'] ?? 0); // when set, every file goes to this client
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $files = $_FILES['chats'] ?? null;
    $createMissing = !empty($_POST['create']);
    $items = [];
    if ($files && is_array($files['name'])) {
        for ($i = 0; $i < min(count($files['name']), 30); $i++) {
            if ($files['error'][$i] !== UPLOAD_ERR_OK) { if ($files['name'][$i] !== '') $report[] = ['file' => $files['name'][$i], 'status' => 'err', 'note' => 'Upload failed (file too large for the server?)']; continue; }
            $got = chat_texts_from_upload($files['tmp_name'][$i], $files['name'][$i]);
            if (isset($got['error'])) { $report[] = ['file' => $files['name'][$i], 'status' => 'err', 'note' => $got['error']]; continue; }
            foreach ($got as $g) $items[] = $g;
        }
    }
    if (!$items && !$report) { flash('Choose one or more exported chat files (.txt or .zip).', 'err'); redirect('/dashboard/chats.php' . ($target ? '?client=' . $target : '')); }

    foreach ($items as $it) {
        $title = chat_title_from_filename($it['name']);
        $msgs = chat_parse($it['text']);
        if (count($msgs) < 1) { $report[] = ['file' => $it['name'], 'status' => 'err', 'note' => 'No messages found. Is this an exported WhatsApp chat?']; continue; }

        // which client?
        $client = null; $created = false;
        if ($target) {
            $s = $pdo->prepare('SELECT * FROM clients WHERE id = ?'); $s->execute([$target]); $client = $s->fetch(PDO::FETCH_ASSOC);
        } else {
            $phone = chat_phone_from_title($title);
            if ($phone !== '') {
                $hit = find_client_by_phone($pdo, $phone);
                if ($hit) { $s = $pdo->prepare('SELECT * FROM clients WHERE id = ?'); $s->execute([$hit['id']]); $client = $s->fetch(PDO::FETCH_ASSOC); }
            }
            if (!$client && $title !== '') {
                $s = $pdo->prepare('SELECT * FROM clients WHERE lower(name) = lower(?) LIMIT 1'); $s->execute([$title]); $client = $s->fetch(PDO::FETCH_ASSOC);
            }
        }
        if (!$client) {
            if (!$createMissing || $title === '') { $report[] = ['file' => $it['name'], 'status' => 'skip', 'note' => 'No matching client (tick "Create the client if not found" to add them).']; continue; }
            $phone = chat_phone_from_title($title);
            $pdo->prepare("INSERT INTO clients (name, whatsapp_number, source, stage, notes) VALUES (?,?,?,'lead','')")->execute([mb_substr($title, 0, 120), $phone, 'WhatsApp']);
            $cid = (int)$pdo->lastInsertId();
            $s = $pdo->prepare('SELECT * FROM clients WHERE id = ?'); $s->execute([$cid]); $client = $s->fetch(PDO::FETCH_ASSOC);
            $created = true;
        }

        $body = chat_normalise($it['text']);
        $sha = sha1($body);
        $dup = $pdo->prepare('SELECT COUNT(*) FROM chats WHERE client_id = ? AND sha = ?'); $dup->execute([$client['id'], $sha]);
        if ($dup->fetchColumn()) { $report[] = ['file' => $it['name'], 'status' => 'skip', 'client' => $client, 'note' => 'This exact chat is already saved for this client.']; continue; }

        $courses = chat_courses($body);
        $pdo->prepare('INSERT INTO chats (client_id, title, msg_count, first_at, last_at, courses, sha, body, imported_by, imported_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$client['id'], mb_substr($title, 0, 120), count($msgs), $msgs[0]['at'], $msgs[count($msgs) - 1]['at'], implode(', ', $courses), $sha, $body, current_user()['username'], time()]);
        // fill the client's course only if it was empty; never overwrite what you typed
        if ($courses && trim((string)$client['course']) === '') $pdo->prepare('UPDATE clients SET course = ? WHERE id = ?')->execute([implode(', ', array_slice($courses, 0, 3)), $client['id']]);
        $pdo->prepare("INSERT INTO activities (client_id, kind, body) VALUES (?, 'whatsapp', ?)")->execute([$client['id'], 'WhatsApp chat imported: ' . count($msgs) . ' messages (' . $msgs[0]['at'] . ' to ' . $msgs[count($msgs) - 1]['at'] . ')']);
        audit('chat imported', $client['name'] . ' (#' . $client['id'] . '), ' . count($msgs) . ' messages');
        $report[] = ['file' => $it['name'], 'status' => $created ? 'new' : 'ok', 'client' => $client, 'n' => count($msgs), 'courses' => $courses];
    }
}

$recent = $pdo->query('SELECT ch.id, ch.client_id, ch.title, ch.msg_count, ch.first_at, ch.last_at, ch.courses, c.name FROM chats ch JOIN clients c ON c.id = ch.client_id ORDER BY ch.imported_at DESC, ch.id DESC LIMIT 25')->fetchAll(PDO::FETCH_ASSOC);
$targetClient = null;
if ($target) { $s = $pdo->prepare('SELECT id, name FROM clients WHERE id = ?'); $s->execute([$target]); $targetClient = $s->fetch(PDO::FETCH_ASSOC); }

$pageTitle = 'Import WhatsApp chats';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if ($report): ?>
<section class="card">
  <div class="card-head"><h2>Result</h2></div>
  <div class="tablewrap"><table><thead><tr><th>File</th><th>Client</th><th class="num">Messages</th><th>Result</th></tr></thead><tbody>
    <?php foreach ($report as $r): ?><tr>
      <td><?php echo e($r['file']); ?></td>
      <td><?php echo isset($r['client']) ? '<a href="/dashboard/clients.php?action=view&amp;id=' . (int)$r['client']['id'] . '">' . e($r['client']['name']) . '</a>' : '-'; ?></td>
      <td class="num"><?php echo isset($r['n']) ? (int)$r['n'] : '-'; ?></td>
      <td><?php
        if ($r['status'] === 'ok') echo '<span class="badge b-paid">added to client</span>';
        elseif ($r['status'] === 'new') echo '<span class="badge b-active">new client created</span>';
        elseif ($r['status'] === 'skip') echo '<span class="badge b-pending">skipped</span> <span class="muted">' . e($r['note']) . '</span>';
        else echo '<span class="badge b-unpaid">failed</span> <span class="muted">' . e($r['note']) . '</span>';
        if (!empty($r['courses'])) echo '<br><span class="muted">Courses mentioned: ' . e(implode(', ', $r['courses'])) . '</span>';
      ?></td></tr><?php endforeach; ?>
  </tbody></table></div>
</section>
<?php endif; ?>
<div class="grid2">
<section class="card">
  <div class="card-head"><h2><?php echo $targetClient ? 'Add chats for ' . e($targetClient['name']) : 'Import WhatsApp chats'; ?></h2></div>
  <p class="muted" style="margin-top:0">Pick only the students you want. In WhatsApp open the chat &rarr; <strong>&#8942; / name</strong> &rarr; <strong>Export chat</strong> &rarr; <strong>Without media</strong>, save the file, then upload it here. You can select many files at once.</p>
  <form method="post" enctype="multipart/form-data" class="stack">
    <?php echo csrf_field(); ?>
    <?php if ($targetClient): ?><input type="hidden" name="client" value="<?php echo (int)$targetClient['id']; ?>"><?php endif; ?>
    <div><label for="ch">Chat files (.txt, or .zip from iPhone), up to 30</label><input id="ch" type="file" name="chats[]" accept=".txt,.zip,text/plain" multiple required></div>
    <?php if (!$targetClient): ?><div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="create" value="1" checked style="width:auto"> Create the client if not found</label></div><?php endif; ?>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Import</button><a class="btn ghost" href="/dashboard/clients.php">Back to clients</a></div>
  </form>
  <p class="muted" style="margin-bottom:0">Chats are matched by the name in the file name ("WhatsApp Chat with Ali Khan") or by phone number when the contact is not saved. Order details, amounts and course codes stay in your own words in Orders; the chat is kept as a private record on the client's page.</p>
</section>
<section class="card">
  <div class="card-head"><h2>Recently imported</h2></div>
  <?php if (!$recent): ?><div class="empty">Nothing yet.</div><?php else: ?>
  <ul class="list"><?php foreach ($recent as $c): ?>
    <li><span><a href="/dashboard/chat.php?id=<?php echo (int)$c['id']; ?>"><strong><?php echo e($c['name']); ?></strong></a><br><span class="muted"><?php echo (int)$c['msg_count']; ?> messages &middot; <?php echo e($c['first_at']); ?> &ndash; <?php echo e($c['last_at']); ?><?php echo $c['courses'] ? ' &middot; ' . e($c['courses']) : ''; ?></span></span></li>
  <?php endforeach; ?></ul>
  <?php endif; ?>
</section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
