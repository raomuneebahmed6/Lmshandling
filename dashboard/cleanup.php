<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();

$keep = clean_tags($_POST['keep_tag'] ?? $_GET['keep_tag'] ?? 'mids-2026-27');
$keep = $keep !== '' ? explode(', ', $keep)[0] : '';
$noOrdersOnly = $_SERVER['REQUEST_METHOD'] === 'POST' ? !empty($_POST['no_orders']) : (!isset($_GET['q']) || !empty($_GET['no_orders']));

// the clients that would be removed: not tagged with $keep (and, by default, with no orders at all)
function cleanup_targets($pdo, $keep, $noOrdersOnly) {
    $sql = 'SELECT c.* FROM clients c WHERE 1=1';
    $params = [];
    if ($keep !== '') {
        $sql .= " AND NOT ((',' || REPLACE(COALESCE(c.tags,''), ', ', ',') || ',') LIKE ?)";
        $params[] = '%,' . $keep . ',%';
    }
    if ($noOrdersOnly) $sql .= ' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.client_id = c.id)';
    $s = $pdo->prepare($sql . ' ORDER BY c.id');
    $s->execute($params);
    return $s->fetchAll(PDO::FETCH_ASSOC);
}

$targets = cleanup_targets($pdo, $keep, $noOrdersOnly);
$total = (int)$pdo->query('SELECT COUNT(*) FROM clients')->fetchColumn();
$kept = $total - count($targets);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['do'] ?? '') === 'delete') {
    csrf_check();
    if ($keep === '') { flash('Enter the tag of the clients you want to keep.', 'err'); redirect('/dashboard/cleanup.php'); }
    if (!$targets) { flash('Nothing to remove.', 'err'); redirect('/dashboard/cleanup.php'); }
    if ($kept < 1) { flash('No client has that tag, so nothing was removed.', 'err'); redirect('/dashboard/cleanup.php'); }
    if ((int)($_POST['confirm'] ?? -1) !== count($targets)) { flash('The number you typed does not match. Nothing was deleted.', 'err'); redirect('/dashboard/cleanup.php?keep_tag=' . urlencode($keep) . '&q=1' . ($noOrdersOnly ? '&no_orders=1' : '')); }
    $bundle = [];
    $act = $pdo->prepare('SELECT * FROM activities WHERE client_id = ?');
    $ord = $pdo->prepare('SELECT * FROM orders WHERE client_id = ?');
    $pay = $pdo->prepare('SELECT * FROM payments WHERE order_id = ?');
    $cht = $pdo->prepare('SELECT * FROM chats WHERE client_id = ?');
    $pdo->beginTransaction();
    foreach ($targets as $c) {
        $act->execute([$c['id']]); $ord->execute([$c['id']]); $cht->execute([$c['id']]);
        $orders = $ord->fetchAll(PDO::FETCH_ASSOC);
        $payments = [];
        foreach ($orders as $o) { $pay->execute([$o['id']]); foreach ($pay->fetchAll(PDO::FETCH_ASSOC) as $p) $payments[] = $p; }
        $bundle[] = ['client' => $c, 'orders' => $orders, 'payments' => $payments, 'activities' => $act->fetchAll(PDO::FETCH_ASSOC), 'chats' => $cht->fetchAll(PDO::FETCH_ASSOC)];
    }
    trash_put('bulk', count($targets) . ' clients not tagged "' . $keep . '"', ['clients' => $bundle]);
    $del = $pdo->prepare('DELETE FROM clients WHERE id = ?');
    foreach ($targets as $c) $del->execute([$c['id']]);
    $pdo->commit();
    audit('bulk clean-up', count($targets) . ' clients removed, kept tag "' . $keep . '"');
    flash(count($targets) . ' clients moved to Trash as one batch. You can bring them all back from Activity > Trash for 90 days.');
    redirect('/dashboard/cleanup.php?keep_tag=' . urlencode($keep));
}

$byStage = []; $bySource = [];
foreach ($targets as $c) {
    $byStage[$c['stage']] = ($byStage[$c['stage']] ?? 0) + 1;
    $k = $c['source'] !== null && $c['source'] !== '' ? $c['source'] : '(none)';
    $bySource[$k] = ($bySource[$k] ?? 0) + 1;
}
arsort($bySource);
$tagCounts = [];
foreach ($pdo->query("SELECT tags FROM clients WHERE tags IS NOT NULL AND tags != ''") as $r) foreach (explode(', ', $r['tags']) as $t) $tagCounts[$t] = ($tagCounts[$t] ?? 0) + 1;
arsort($tagCounts);

$pageTitle = 'Clean up clients';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="stats">
  <div class="stat"><div class="num"><?php echo $total; ?></div><div class="label">Clients now</div></div>
  <div class="stat"><div class="num"><?php echo $kept; ?></div><div class="label">Will stay (tag "<?php echo e($keep); ?>"<?php echo $noOrdersOnly ? ' or have orders' : ''; ?>)</div></div>
  <div class="stat<?php echo count($targets) ? ' alert' : ''; ?>"><div class="num"><?php echo count($targets); ?></div><div class="label">Would be removed</div></div>
</div>

<div class="grid2">
<section class="card">
  <div class="card-head"><h2>Keep only clients with one tag</h2></div>
  <p class="muted" style="margin-top:0">Use this if a wrong file was imported (for example keywords or leads). Everyone <strong>without</strong> the tag below is moved to Trash in one batch, so nothing is lost for 90 days.</p>
  <form method="get" class="stack">
    <input type="hidden" name="q" value="1">
    <div><label for="kt">Tag to keep</label><input id="kt" name="keep_tag" value="<?php echo e($keep); ?>" list="tags" required><datalist id="tags"><?php foreach ($tagCounts as $t => $n): ?><option value="<?php echo e($t); ?>"><?php endforeach; ?></datalist></div>
    <div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="no_orders" value="1" style="width:auto"<?php echo $noOrdersOnly ? ' checked' : ''; ?>> Safety: never remove a client who has orders</label></div>
    <div><button type="submit" class="ghost">Preview</button></div>
  </form>
  <?php if ($tagCounts): ?><p class="muted" style="margin-bottom:0">Tags in use: <?php foreach (array_slice($tagCounts, 0, 12, true) as $t => $n): ?><a class="badge b-partial" style="margin-right:4px" href="/dashboard/cleanup.php?q=1&amp;no_orders=1&amp;keep_tag=<?php echo urlencode($t); ?>"><?php echo e($t); ?> (<?php echo (int)$n; ?>)</a><?php endforeach; ?></p><?php endif; ?>
</section>

<section class="card">
  <div class="card-head"><h2>What would be removed</h2></div>
  <?php if (!$targets): ?>
    <div class="empty">Nothing to remove with these settings.</div>
  <?php else: ?>
    <p class="muted" style="margin-top:0">By stage: <?php foreach ($byStage as $s => $n): ?><span class="badge b-<?php echo e($s); ?>"><?php echo e(STAGES[$s] ?? $s); ?> <?php echo (int)$n; ?></span> <?php endforeach; ?><br>By source: <?php foreach (array_slice($bySource, 0, 6, true) as $s => $n): ?><span class="badge b-partial"><?php echo e($s); ?> <?php echo (int)$n; ?></span> <?php endforeach; ?></p>
    <ul class="list"><?php foreach (array_slice($targets, 0, 25) as $c): ?><li><span><?php echo e($c['name']); ?> <span class="muted"><?php echo e($c['whatsapp_number'] ?: ($c['vu_id'] ?: '')); ?></span></span><span class="badge b-<?php echo e($c['stage']); ?>"><?php echo e(STAGES[$c['stage']] ?? $c['stage']); ?></span></li><?php endforeach; ?></ul>
    <?php if (count($targets) > 25): ?><p class="muted">...and <?php echo count($targets) - 25; ?> more.</p><?php endif; ?>
    <?php if ($keep !== '' && $kept > 0): ?>
    <form method="post" class="stack" data-confirm="Move <?php echo count($targets); ?> clients to Trash?" style="margin-top:14px">
      <?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="keep_tag" value="<?php echo e($keep); ?>"><?php if ($noOrdersOnly): ?><input type="hidden" name="no_orders" value="1"><?php endif; ?>
      <div><label for="cf">Type the number <strong><?php echo count($targets); ?></strong> to confirm</label><input id="cf" name="confirm" inputmode="numeric" required autocomplete="off" style="max-width:160px"></div>
      <div><button type="submit" class="danger">Move <?php echo count($targets); ?> clients to Trash</button></div>
    </form>
    <?php elseif ($kept === 0): ?><div class="msg msg-warn" style="margin-top:12px">No client has this tag, so removing is blocked (it would delete everyone). Check the tag spelling.</div><?php endif; ?>
  <?php endif; ?>
</section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
