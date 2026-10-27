<?php
// Batches: every tag (for example mids-2026-27) as a group, with paid / unpaid counts, quick marking,
// reminder links and a list of people whose phone number is still missing.
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

const PAY_TAGS = ['paid', 'unpaid', 'payment-unknown'];

function tag_list($tags) {
    return array_values(array_filter(array_map('trim', explode(',', (string)$tags)), function ($t) { return $t !== ''; }));
}

function with_pay_tag($tags, $status) {
    $keep = array_filter(tag_list($tags), function ($t) { return !in_array(strtolower($t), PAY_TAGS, true); });
    if ($status !== '') $keep[] = $status;
    return clean_tags(implode(',', $keep));
}

function pay_state($tags) {
    foreach (tag_list($tags) as $t) {
        $t = strtolower($t);
        if ($t === 'paid') return 'paid';
        if ($t === 'unpaid') return 'unpaid';
    }
    return 'unknown';
}

$tag = trim($_GET['tag'] ?? '');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $tag = trim($_POST['tag'] ?? '');
    $status = $_POST['status'] ?? '';
    if (!in_array($status, ['paid', 'unpaid', 'payment-unknown'], true)) { flash('Choose paid or unpaid.', 'err'); redirect('/dashboard/batches?tag=' . urlencode($tag)); }
    $ids = array_values(array_unique(array_map('intval', (array)($_POST['ids'] ?? []))));
    if (!$ids) { flash('Tick at least one person first.', 'err'); redirect('/dashboard/batches?tag=' . urlencode($tag)); }
    $ids = array_slice($ids, 0, 500);
    $sel = $pdo->prepare('SELECT id, tags FROM clients WHERE id = ?');
    $upd = $pdo->prepare('UPDATE clients SET tags = ? WHERE id = ?');
    $n = 0;
    $pdo->beginTransaction();
    foreach ($ids as $cid) {
        $sel->execute([$cid]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        if (!$row) continue;
        $upd->execute([with_pay_tag($row['tags'], $status), $cid]);
        $n++;
    }
    $pdo->commit();
    audit('payment tag set', $n . ' client(s) marked ' . $status . ($tag !== '' ? ' in ' . $tag : ''));
    flash($n . ' marked ' . $status . '.');
    redirect('/dashboard/batches?tag=' . urlencode($tag) . (isset($_POST['show']) && $_POST['show'] !== '' ? '&show=' . urlencode($_POST['show']) : ''));
}

// ---- overview: all tags that are not payment tags ----
$all = $pdo->query("SELECT id, name, vu_id, whatsapp_number, tags, stage FROM clients")->fetchAll(PDO::FETCH_ASSOC);
$groups = [];
foreach ($all as $c) {
    $st = pay_state($c['tags']);
    foreach (tag_list($c['tags']) as $t) {
        if (in_array(strtolower($t), PAY_TAGS, true)) continue;
        $g = &$groups[$t];
        if (!isset($g)) $g = ['total' => 0, 'paid' => 0, 'unpaid' => 0, 'unknown' => 0, 'nophone' => 0];
        $g['total']++; $g[$st]++;
        if (wa_number($c['whatsapp_number']) === '') $g['nophone']++;
        unset($g);
    }
}
uasort($groups, function ($a, $b) { return $b['total'] <=> $a['total']; });

$show = $_GET['show'] ?? '';
$members = [];
if ($tag !== '') {
    foreach ($all as $c) {
        if (!in_array(strtolower($tag), array_map('strtolower', tag_list($c['tags'])), true)) continue;
        $c['pay'] = pay_state($c['tags']);
        if ($show !== '' && $c['pay'] !== $show) continue;
        $members[] = $c;
    }
    usort($members, function ($a, $b) { return $a['id'] <=> $b['id']; });
}

$pageTitle = 'Batches';
$page = 'batches';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if ($tag === ''): ?>
<section class="card">
  <div class="card-head"><h2>Batches</h2><span class="muted">Every tag is a group, for example a semester or a class list</span></div>
  <?php if (!$groups): ?><div class="empty">No tags yet. Import a list with a tag, or add tags on a client.</div><?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Batch (tag)</th><th class="num">People</th><th class="num">Paid</th><th class="num">Unpaid</th><th class="num">Not set</th><th class="num">No phone</th></tr></thead>
    <tbody><?php foreach ($groups as $name => $g): ?>
      <tr><td><a href="/dashboard/batches?tag=<?php echo urlencode($name); ?>"><strong><?php echo e($name); ?></strong></a></td>
        <td class="num"><?php echo $g['total']; ?></td>
        <td class="num"><?php echo $g['paid']; ?></td>
        <td class="num"><?php echo $g['unpaid'] ? '<strong class="due-over">' . $g['unpaid'] . '</strong>' : 0; ?></td>
        <td class="num"><?php echo $g['unknown']; ?></td>
        <td class="num"><?php echo $g['nophone']; ?></td></tr>
    <?php endforeach; ?></tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php else:
    $cnt = ['paid' => 0, 'unpaid' => 0, 'unknown' => 0]; $nophone = 0;
    foreach ($all as $c) {
        if (!in_array(strtolower($tag), array_map('strtolower', tag_list($c['tags'])), true)) continue;
        $cnt[pay_state($c['tags'])]++;
        if (wa_number($c['whatsapp_number']) === '') $nophone++;
    }
?>
<section class="card">
  <div class="card-head"><h2><?php echo e($tag); ?></h2><a class="btn ghost sm" href="/dashboard/batches">All batches</a></div>
  <div class="tabs" style="margin-bottom:12px">
    <a href="?tag=<?php echo urlencode($tag); ?>"<?php echo $show === '' ? ' class="on"' : ''; ?>>All <?php echo array_sum($cnt); ?></a>
    <a href="?tag=<?php echo urlencode($tag); ?>&amp;show=paid"<?php echo $show === 'paid' ? ' class="on"' : ''; ?>>Paid <?php echo $cnt['paid']; ?></a>
    <a href="?tag=<?php echo urlencode($tag); ?>&amp;show=unpaid"<?php echo $show === 'unpaid' ? ' class="on"' : ''; ?>>Unpaid <?php echo $cnt['unpaid']; ?></a>
    <a href="?tag=<?php echo urlencode($tag); ?>&amp;show=unknown"<?php echo $show === 'unknown' ? ' class="on"' : ''; ?>>Not set <?php echo $cnt['unknown']; ?></a>
  </div>
  <?php if ($nophone): ?><p class="muted" style="margin-top:0"><?php echo $nophone; ?> of them have no WhatsApp number saved yet, so the reminder button is missing for them. Open the person and add the number.</p><?php endif; ?>
  <?php if (!$members): ?><div class="empty">Nobody here.</div><?php else: ?>
  <form method="post">
    <?php echo csrf_field(); ?><input type="hidden" name="tag" value="<?php echo e($tag); ?>"><input type="hidden" name="show" value="<?php echo e($show); ?>">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="all" style="width:auto"> Select all</label>
      <button class="gold sm" type="submit" name="status" value="paid">Mark selected PAID</button>
      <button class="ghost sm" type="submit" name="status" value="unpaid">Mark selected UNPAID</button>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>#</th><th>Name</th><th>VU ID</th><th>Payment</th><th></th></tr></thead>
      <tbody><?php foreach ($members as $i => $m): $wa = wa_number($m['whatsapp_number']); ?>
        <tr>
          <td><input type="checkbox" class="pick" name="ids[]" value="<?php echo (int)$m['id']; ?>" style="width:auto" aria-label="Select <?php echo e($m['name']); ?>"></td>
          <td><?php echo $i + 1; ?></td>
          <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$m['id']; ?>"><?php echo e($m['name']); ?></a></td>
          <td><?php echo e($m['vu_id'] ?: '-'); ?></td>
          <td><span class="badge <?php echo $m['pay'] === 'paid' ? 'b-paid' : ($m['pay'] === 'unpaid' ? 'b-unpaid' : 'b-pending'); ?>"><?php echo $m['pay'] === 'unknown' ? 'not set' : e($m['pay']); ?></span></td>
          <td><?php if ($wa && $m['pay'] !== 'paid'): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode(str_replace('{name}', $m['name'], MSG_TEMPLATES['Payment reminder'])); ?>">Remind</a><?php endif; ?></td>
        </tr>
      <?php endforeach; ?></tbody>
    </table></div>
  </form>
  <?php endif; ?>
</section>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
