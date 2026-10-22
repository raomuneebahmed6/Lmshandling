<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$action = $_GET['action'] ?? 'list';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$err = '';

// ---------- POST handlers ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? 'save';
    $cid = (int)($_POST['id'] ?? 0);

    if ($do === 'delete' && $cid) {
        if (!is_admin()) { http_response_code(403); exit('Only the admin can delete clients.'); }
        $cs = $pdo->prepare('SELECT * FROM clients WHERE id=?'); $cs->execute([$cid]); $crow = $cs->fetch(PDO::FETCH_ASSOC);
        if ($crow) {
            $os = $pdo->prepare('SELECT * FROM orders WHERE client_id=?'); $os->execute([$cid]); $orows = $os->fetchAll(PDO::FETCH_ASSOC);
            $prow = [];
            foreach ($orows as $or) { $ps = $pdo->prepare('SELECT * FROM payments WHERE order_id=?'); $ps->execute([$or['id']]); foreach ($ps->fetchAll(PDO::FETCH_ASSOC) as $pr) $prow[] = $pr; }
            $as = $pdo->prepare('SELECT * FROM activities WHERE client_id=?'); $as->execute([$cid]);
            trash_put('client', $crow['name'], ['client' => $crow, 'orders' => $orows, 'payments' => $prow, 'activities' => $as->fetchAll(PDO::FETCH_ASSOC)]);
            audit('client deleted', $crow['name'] . ' (#' . $cid . ')');
        }
        $pdo->prepare('DELETE FROM clients WHERE id=?')->execute([$cid]);
        flash('Client deleted. The admin can restore it from Activity > Trash for 90 days.');
        redirect('/dashboard/clients.php');
    }

    if ($do === 'activity' && $cid) {
        $kind = array_key_exists($_POST['kind'] ?? '', ACTIVITY_KINDS) ? $_POST['kind'] : 'note';
        $body = trim($_POST['body'] ?? '');
        if ($body !== '') {
            $pdo->prepare('INSERT INTO activities (client_id, kind, body) VALUES (?,?,?)')->execute([$cid, $kind, mb_substr($body, 0, 2000)]);
            flash('Activity logged.');
        }
        redirect('/dashboard/clients.php?action=view&id=' . $cid);
    }

    if ($do === 'quick' && $cid) {
        $stage = array_key_exists($_POST['stage'] ?? '', STAGES) ? $_POST['stage'] : 'lead';
        $fu = trim($_POST['next_followup'] ?? '');
        $fu = valid_date($fu) ? $fu : null;
        $pdo->prepare('UPDATE clients SET stage=?, next_followup=? WHERE id=?')->execute([$stage, $fu, $cid]);
        flash('Client updated.');
        redirect('/dashboard/clients.php?action=view&id=' . $cid);
    }

    if ($do === 'snooze' && $cid) {
        $days = max(1, min(60, (int)($_POST['days'] ?? 1)));
        $pdo->prepare('UPDATE clients SET next_followup=? WHERE id=?')->execute([date('Y-m-d', strtotime("+$days days")), $cid]);
        audit('follow-up snoozed', '#' . $cid . ' +' . $days . 'd');
        flash("Follow-up moved by $days day(s).");
        $b = (string)($_POST['back'] ?? '');
        redirect($b === 'followups' ? '/dashboard/followups.php' : ($b === 'home' ? '/dashboard/index.php' : '/dashboard/clients.php?action=view&id=' . $cid));
    }

    if ($do === 'done' && $cid) {
        $pdo->prepare('UPDATE clients SET next_followup=NULL WHERE id=?')->execute([$cid]);
        $pdo->prepare("INSERT INTO activities (client_id, kind, body) VALUES (?, 'note', 'Follow-up done')")->execute([$cid]);
        flash('Follow-up marked done.');
        redirect(($_POST['back'] ?? '') === 'followups' ? '/dashboard/followups.php' : '/dashboard/clients.php?action=view&id=' . $cid);
    }

    // save (create / update)
    $name = trim($_POST['name'] ?? '');
    $whatsapp = trim($_POST['whatsapp_number'] ?? '');
    $course = trim($_POST['course'] ?? '');
    $source = trim($_POST['source'] ?? '');
    $notes = trim($_POST['notes'] ?? '');
    $tags = clean_tags($_POST['tags'] ?? '');
    $stage = array_key_exists($_POST['stage'] ?? '', STAGES) ? $_POST['stage'] : 'lead';
    $fu = trim($_POST['next_followup'] ?? '');
    $fu = valid_date($fu) ? $fu : null;

    $dupe = $name !== '' ? find_client_by_phone($pdo, $whatsapp, $cid) : null;
    if ($name === '') {
        $err = 'Name is required.';
        $action = $cid ? 'edit' : 'new';
        $id = $cid;
    } elseif ($dupe && empty($_POST['allow_dupe'])) {
        $err = 'A client with this number already exists: ' . $dupe['name'] . '. Tick "Save anyway" if this is a different person.';
        $dupeId = (int)$dupe['id'];
        $action = $cid ? 'edit' : 'new';
        $id = $cid;
    } elseif ($cid) {
        $pdo->prepare('UPDATE clients SET name=?, whatsapp_number=?, course=?, source=?, notes=?, stage=?, next_followup=?, tags=? WHERE id=?')
            ->execute([$name, $whatsapp, $course, $source, $notes, $stage, $fu, $tags, $cid]);
        audit('client updated', $name . ' (#' . $cid . ')');
        flash('Client saved.');
        redirect('/dashboard/clients.php?action=view&id=' . $cid);
    } else {
        $pdo->prepare('INSERT INTO clients (name, whatsapp_number, course, source, notes, stage, next_followup, tags) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$name, $whatsapp, $course, $source, $notes, $stage, $fu, $tags]);
        $newCid = (int)$pdo->lastInsertId(); // read before audit() inserts its own row
        audit('client added', $name . ' (#' . $newCid . ')');
        flash('Client added.');
        redirect('/dashboard/clients.php?action=view&id=' . $newCid);
    }
}

$pageTitle = 'Clients';
$page = 'clients';

// ---------- add / edit form ----------
if ($action === 'new' || $action === 'edit') {
    $client = ['id' => '', 'name' => '', 'whatsapp_number' => '', 'course' => '', 'source' => '', 'notes' => '', 'stage' => 'lead', 'next_followup' => '', 'tags' => ''];
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM clients WHERE id=?');
        $s->execute([$id]);
        $client = $s->fetch(PDO::FETCH_ASSOC) ?: $client;
    }
    if ($err) { // keep what was typed
        foreach (['name', 'whatsapp_number', 'course', 'source', 'notes', 'tags'] as $f) $client[$f] = $_POST[$f] ?? '';
    }
    $pageTitle = $client['id'] ? 'Edit client' : 'Add client';
    include __DIR__ . '/includes/layout_top.php';
    ?>
<div class="card" style="max-width:640px">
  <?php if ($err): ?><div class="msg msg-err"><?php echo e($err); ?><?php if (!empty($dupeId)): ?> <a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$dupeId; ?>">Open that client</a><?php endif; ?></div><?php endif; ?>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?>
    <input type="hidden" name="do" value="save">
    <input type="hidden" name="id" value="<?php echo e($client['id']); ?>">
    <div><label for="name">Name</label><input id="name" name="name" value="<?php echo e($client['name']); ?>" required></div>
    <div class="row2">
      <div><label for="wa">WhatsApp number</label><input id="wa" name="whatsapp_number" value="<?php echo e($client['whatsapp_number']); ?>" placeholder="03XXXXXXXXX" inputmode="tel"></div>
      <div><label for="course">Course / program</label><input id="course" name="course" value="<?php echo e($client['course']); ?>" placeholder="e.g. BS CS, MBA"></div>
    </div>
    <div class="row2">
      <div><label for="stage">Stage</label>
        <select id="stage" name="stage"><?php foreach (STAGES as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $client['stage'] === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?></select></div>
      <div><label for="source">Source</label><input id="source" name="source" list="sources" value="<?php echo e($client['source']); ?>" placeholder="WhatsApp, Facebook, referral...">
        <datalist id="sources"><option>WhatsApp</option><option>Website</option><option>Facebook</option><option>Instagram</option><option>Referral</option><option>Google</option></datalist></div>
    </div>
    <div><label for="fu">Next follow-up</label><input id="fu" type="date" name="next_followup" value="<?php echo e($client['next_followup']); ?>"></div>
    <div><label for="tags">Tags (comma separated)</label><input id="tags" name="tags" value="<?php echo e($client['tags']); ?>" placeholder="e.g. FYP, VIP, late payer"></div>
    <?php if (!empty($dupeId)): ?><div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="allow_dupe" value="1" style="width:auto"> Save anyway (different person)</label></div><?php endif; ?>
    <div><label for="notes">Notes</label><textarea id="notes" name="notes"><?php echo e($client['notes']); ?></textarea></div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Save client</button><a class="btn ghost" href="/dashboard/clients.php<?php echo $client['id'] ? '?action=view&amp;id=' . (int)$client['id'] : ''; ?>">Cancel</a></div>
  </form>
</div>
<?php
    include __DIR__ . '/includes/layout_bottom.php';
    exit;
}

// ---------- client profile ----------
if ($action === 'view' && $id) {
    $s = $pdo->prepare('SELECT * FROM clients WHERE id=?');
    $s->execute([$id]);
    $client = $s->fetch(PDO::FETCH_ASSOC);
    $pageTitle = $client ? $client['name'] : 'Client';
    include __DIR__ . '/includes/layout_top.php';
    if (!$client) {
        echo '<div class="card empty">Client not found. <a href="/dashboard/clients.php">Back to clients</a></div>';
        include __DIR__ . '/includes/layout_bottom.php';
        exit;
    }
    $s = $pdo->prepare('SELECT * FROM orders WHERE client_id=? ORDER BY order_date DESC, id DESC');
    $s->execute([$id]);
    $orders = $s->fetchAll(PDO::FETCH_ASSOC);
    $s = $pdo->prepare('SELECT * FROM activities WHERE client_id=? ORDER BY created_at DESC, id DESC LIMIT 60');
    $s->execute([$id]);
    $acts = $s->fetchAll(PDO::FETCH_ASSOC);
    $fileTotal = array_sum(array_column($orders, 'file_count'));
    $paidTotal = 0; $dueTotal = 0;
    foreach ($orders as $o) { $paidTotal += (float)$o['paid_amount']; $dueTotal += owed($o); }
    $wa = wa_number($client['whatsapp_number']);
    $today = date('Y-m-d');
    $msgText = 'Assalam o Alaikum ' . $client['name'] . ', this is Nibaha Haq from lmshandling.com. ';
    ?>
<div class="card">
  <div class="card-head">
    <div><h2 style="font-size:20px"><?php echo e($client['name']); ?> <span class="badge b-<?php echo e($client['stage']); ?>"><?php echo e(STAGES[$client['stage']] ?? $client['stage']); ?></span></h2>
      <div class="muted">Added <?php echo e(substr($client['created_at'], 0, 10)); ?><?php echo $client['source'] ? ' &middot; via ' . e($client['source']) : ''; ?></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <?php if ($wa): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode($msgText); ?>">WhatsApp</a><?php endif; ?>
      <a class="btn ghost sm" href="/dashboard/statement.php?client=<?php echo $id; ?>" target="_blank">Statement</a>
      <a class="btn ghost sm" href="/dashboard/clients.php?action=edit&amp;id=<?php echo $id; ?>">Edit</a>
      <?php if (is_admin()): ?><form method="post" class="inline" data-confirm="Delete this client and all their orders and history? This cannot be undone.">
        <?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo $id; ?>">
        <button type="submit" class="danger sm">Delete</button>
      </form><?php endif; ?>
    </div>
  </div>
  <dl class="kv">
    <dt>WhatsApp</dt><dd><?php echo e($client['whatsapp_number'] ?: '-'); ?></dd>
    <dt>Course</dt><dd><?php echo e($client['course'] ?: '-'); ?></dd>
    <dt>Tags</dt><dd><?php if ($client['tags']): foreach (explode(', ', $client['tags']) as $tg): ?><a class="badge b-partial" style="margin-right:4px" href="/dashboard/clients.php?tag=<?php echo urlencode($tg); ?>"><?php echo e($tg); ?></a><?php endforeach; else: ?>-<?php endif; ?></dd>
    <dt>Files sent</dt><dd><?php echo (int)$fileTotal; ?></dd>
    <dt>Paid / Outstanding</dt><dd><?php echo e(money($paidTotal)); ?> / <strong<?php echo $dueTotal > 0 ? ' class="due-over"' : ''; ?>><?php echo e(money($dueTotal)); ?></strong></dd>
    <dt>Notes</dt><dd><?php echo $client['notes'] ? nl2br(e($client['notes'])) : '-'; ?></dd>
  </dl>
  <?php if ($wa): ?>
  <div style="margin-top:16px"><div class="muted" style="margin-bottom:6px">Quick WhatsApp messages</div>
    <div class="tabs"><?php foreach (MSG_TEMPLATES as $label => $tpl): ?><a target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode(str_replace('{name}', $client['name'], $tpl)); ?>"><?php echo e($label); ?></a><?php endforeach; ?></div></div>
  <?php endif; ?>
</div>

<div class="grid2">
  <section class="card">
    <div class="card-head"><h2>Orders</h2><a href="/dashboard/orders.php?action=new&amp;client_id=<?php echo $id; ?>" class="btn gold sm">+ New order</a></div>
    <?php if (!$orders): ?><div class="empty">No orders yet for this client.</div><?php else: ?>
    <div class="tablewrap"><table>
      <thead><tr><th>Date</th><th>Type</th><th class="num">Files</th><th class="num">Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($orders as $o): ?>
        <tr>
          <td><?php echo e(substr($o['order_date'], 0, 10)); ?></td>
          <td><?php echo e($o['file_type']); ?></td>
          <td class="num"><?php echo (int)$o['file_count']; ?></td>
          <td class="num"><?php echo $o['amount'] !== null ? e(number_format($o['amount'])) : '-'; ?></td>
          <td><span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span></td>
          <td><span class="badge b-<?php echo e($o['status']); ?>"><?php echo e($o['status']); ?></span></td>
          <td><a class="btn ghost sm" href="/dashboard/orders.php?action=edit&amp;id=<?php echo (int)$o['id']; ?>">Edit</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
    <?php endif; ?>
  </section>

  <div>
    <section class="card">
      <div class="card-head"><h2>Stage and follow-up</h2></div>
      <form method="post" class="stack">
        <?php echo csrf_field(); ?><input type="hidden" name="do" value="quick"><input type="hidden" name="id" value="<?php echo $id; ?>">
        <div class="row2">
          <div><label for="qs">Stage</label><select id="qs" name="stage"><?php foreach (STAGES as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $client['stage'] === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?></select></div>
          <div><label for="qf">Next follow-up</label><input id="qf" type="date" name="next_followup" value="<?php echo e($client['next_followup']); ?>"></div>
        </div>
        <?php if ($client['next_followup']): ?><div class="muted <?php echo $client['next_followup'] < $today ? 'due-over' : ($client['next_followup'] === $today ? 'due-today' : ''); ?>">Follow-up: <?php echo e($client['next_followup']); ?></div><?php endif; ?>
        <div style="display:flex;gap:8px"><button type="submit" class="sm">Update</button></div>
      </form>
      <?php if ($client['next_followup']): ?>
      <form method="post" style="margin-top:8px"><?php echo csrf_field(); ?><input type="hidden" name="do" value="done"><input type="hidden" name="id" value="<?php echo $id; ?>"><input type="hidden" name="back" value="client"><button type="submit" class="ghost sm">Mark follow-up done</button></form>
      <form method="post" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><?php echo csrf_field(); ?><input type="hidden" name="do" value="snooze"><input type="hidden" name="id" value="<?php echo $id; ?>"><input type="hidden" name="back" value="client"><span class="muted">Snooze:</span><button name="days" value="1" class="ghost sm">+1 day</button><button name="days" value="3" class="ghost sm">+3 days</button><button name="days" value="7" class="ghost sm">+1 week</button></form>
      <?php endif; ?>
    </section>

    <section class="card">
      <div class="card-head"><h2>Activity</h2></div>
      <form method="post" class="stack" style="margin-bottom:16px">
        <?php echo csrf_field(); ?><input type="hidden" name="do" value="activity"><input type="hidden" name="id" value="<?php echo $id; ?>">
        <div class="row2">
          <select name="kind" aria-label="Type"><?php foreach (ACTIVITY_KINDS as $k => $v): ?><option value="<?php echo $k; ?>"><?php echo $v; ?></option><?php endforeach; ?></select>
        </div>
        <textarea name="body" placeholder="What happened? e.g. Sent 3 Midterm files, asked for payment" required maxlength="2000"></textarea>
        <div><button type="submit" class="sm">Log activity</button></div>
      </form>
      <?php if (!$acts): ?><div class="muted">No activity logged yet.</div><?php else: ?>
      <ul class="timeline">
        <?php foreach ($acts as $a): ?>
        <li><div class="when"><?php echo e(ACTIVITY_KINDS[$a['kind']] ?? $a['kind']); ?> &middot; <?php echo e(substr($a['created_at'], 0, 16)); ?></div><div><?php echo nl2br(e($a['body'])); ?></div></li>
        <?php endforeach; ?>
      </ul>
      <?php endif; ?>
    </section>
  </div>
</div>
<?php
    include __DIR__ . '/includes/layout_bottom.php';
    exit;
}

// ---------- list ----------
$search = trim($_GET['q'] ?? '');
$tagF = trim($_GET['tag'] ?? '');
$stageF = $_GET['stage'] ?? '';
if (!array_key_exists($stageF, STAGES)) $stageF = '';

$where = []; $params = [];
if ($search !== '') {
    $where[] = '(c.name LIKE ? OR c.whatsapp_number LIKE ? OR c.course LIKE ? OR c.source LIKE ?)';
    $like = '%' . $search . '%';
    array_push($params, $like, $like, $like, $like);
}
if ($stageF !== '') { $where[] = 'c.stage = ?'; $params[] = $stageF; }
if ($tagF !== '') { $where[] = "(',' || REPLACE(COALESCE(c.tags,''), ', ', ',') || ',') LIKE ?"; $params[] = '%,' . $tagF . ',%'; }
$sql = "SELECT c.*,
  (SELECT COUNT(*) FROM orders o WHERE o.client_id=c.id) AS order_count,
  (SELECT COALESCE(SUM(MAX(COALESCE(o.amount,0)-COALESCE(o.paid_amount,0),0)),0) FROM orders o WHERE o.client_id=c.id) AS owed
  FROM clients c" . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.created_at DESC, c.id DESC';
$s = $pdo->prepare($sql);
$s->execute($params);
$clients = $s->fetchAll(PDO::FETCH_ASSOC);

$counts = ['' => (int)$pdo->query('SELECT COUNT(*) FROM clients')->fetchColumn()];
foreach ($pdo->query('SELECT stage, COUNT(*) n FROM clients GROUP BY stage') as $r) $counts[$r['stage']] = (int)$r['n'];
$today = date('Y-m-d');

include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <div class="filters">
    <div class="tabs">
      <?php foreach (['' => 'All'] + STAGES as $k => $v): ?>
        <a class="<?php echo $stageF === (string)$k ? 'on' : ''; ?>" href="/dashboard/clients.php?<?php echo http_build_query(array_filter(['stage' => $k, 'q' => $search, 'tag' => $tagF])); ?>"><?php echo e($v); ?><b><?php echo $counts[$k] ?? 0; ?></b></a>
      <?php endforeach; ?>
    </div>
    <form method="get" style="display:flex;gap:8px;margin-left:auto">
      <?php if ($stageF): ?><input type="hidden" name="stage" value="<?php echo e($stageF); ?>"><?php endif; ?>
      <input type="search" name="q" value="<?php echo e($search); ?>" placeholder="Search name, number, course..." aria-label="Search clients">
      <button type="submit" class="sm">Search</button>
    </form>
    <?php if ($tagF !== ''): ?><a class="badge b-partial" href="/dashboard/clients.php">Tag: <?php echo e($tagF); ?> x</a><?php endif; ?>
    <a class="btn ghost sm" href="/dashboard/import.php">Import CSV</a>
    <a class="btn ghost sm" href="/dashboard/export.php?type=clients">Export CSV</a>
  </div>
  <?php if (!$clients): ?>
    <div class="empty"><?php echo ($search || $stageF) ? 'No clients match this filter.' : 'No clients yet. Click "+ Client" to add the first one.'; ?></div>
  <?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Name</th><th>WhatsApp</th><th>Course</th><th>Stage</th><th class="num">Orders</th><th class="num">Owes</th><th>Follow-up</th></tr></thead>
    <tbody>
    <?php foreach ($clients as $c): $wa = wa_number($c['whatsapp_number']); ?>
      <tr data-href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$c['id']; ?>">
        <td><strong><?php echo e($c['name']); ?></strong><?php if ($c['tags']): ?><br><span class="muted"><?php echo e($c['tags']); ?></span><?php endif; ?></td>
        <td><?php echo $wa ? '<a target="_blank" rel="noopener" href="https://wa.me/' . e($wa) . '">' . e($c['whatsapp_number']) . '</a>' : '-'; ?></td>
        <td><?php echo e($c['course'] ?: '-'); ?></td>
        <td><span class="badge b-<?php echo e($c['stage']); ?>"><?php echo e(STAGES[$c['stage']] ?? $c['stage']); ?></span></td>
        <td class="num"><?php echo (int)$c['order_count']; ?></td>
        <td class="num"><?php echo $c['owed'] > 0 ? '<span class="due-over">' . e(number_format($c['owed'])) . '</span>' : '-'; ?></td>
        <td><?php if ($c['next_followup']): ?><span class="<?php echo $c['next_followup'] < $today ? 'due-over' : ($c['next_followup'] === $today ? 'due-today' : ''); ?>"><?php echo e($c['next_followup']); ?></span><?php else: ?>-<?php endif; ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
