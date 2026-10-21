<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();
$q = function ($sql, $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(PDO::FETCH_ASSOC); };

$range = (int)($_GET['months'] ?? 12);
if (!in_array($range, [3, 6, 12, 24], true)) $range = 12;
$from = date('Y-m', strtotime('first day of -' . ($range - 1) . ' month'));
$fromDate = $from . '-01';

// money received per month (by the date the payment came in)
$months = [];
for ($i = $range - 1; $i >= 0; $i--) {
    $k = date('Y-m', strtotime("first day of -$i month"));
    $months[$k] = ['label' => date($range > 12 ? 'M y' : 'M', strtotime($k . '-01')), 'recv' => 0.0, 'billed' => 0.0, 'orders' => 0];
}
foreach ($q('SELECT substr(paid_at,1,7) m, SUM(amount) s FROM payments WHERE substr(paid_at,1,7) >= ? GROUP BY m', [$from]) as $r) if (isset($months[$r['m']])) $months[$r['m']]['recv'] = (float)$r['s'];
foreach ($q('SELECT substr(order_date,1,7) m, SUM(COALESCE(amount,0)) s, COUNT(*) n FROM orders WHERE substr(order_date,1,7) >= ? GROUP BY m', [$from]) as $r) if (isset($months[$r['m']])) { $months[$r['m']]['billed'] = (float)$r['s']; $months[$r['m']]['orders'] = (int)$r['n']; }
$maxM = max(1, max(array_column($months, 'recv')), max(array_column($months, 'billed')));
$totRecv = array_sum(array_column($months, 'recv'));
$totBilled = array_sum(array_column($months, 'billed'));
$totOrders = array_sum(array_column($months, 'orders'));

$byType = $q('SELECT file_type k, COUNT(*) n, SUM(file_count) f, SUM(COALESCE(amount,0)) billed, SUM(paid_amount) recv FROM orders WHERE order_date >= ? GROUP BY file_type ORDER BY billed DESC', [$fromDate]);
$byCourse = $q("SELECT course_code k, COUNT(*) n, SUM(COALESCE(amount,0)) billed, SUM(paid_amount) recv FROM orders WHERE order_date >= ? AND course_code IS NOT NULL AND course_code != '' GROUP BY course_code ORDER BY n DESC, billed DESC LIMIT 10", [$fromDate]);
$bySource = $q("SELECT COALESCE(NULLIF(c.source,''),'Unknown') k, COUNT(DISTINCT c.id) clients, COUNT(o.id) n, SUM(o.paid_amount) recv FROM clients c LEFT JOIN orders o ON o.client_id = c.id AND o.order_date >= ? GROUP BY k ORDER BY recv DESC, clients DESC", [$fromDate]);
$topClients = $q('SELECT c.id, c.name, COUNT(o.id) n, SUM(o.paid_amount) recv, SUM(MAX(COALESCE(o.amount,0)-COALESCE(o.paid_amount,0),0)) owes FROM clients c JOIN orders o ON o.client_id=c.id WHERE o.order_date >= ? GROUP BY c.id ORDER BY recv DESC LIMIT 8', [$fromDate]);
$byMethod = $q('SELECT COALESCE(NULLIF(method,\'\'),\'Other\') k, COUNT(*) n, SUM(amount) s FROM payments WHERE paid_at >= ? GROUP BY k ORDER BY s DESC', [$fromDate]);

$stageCounts = ['lead' => 0, 'active' => 0, 'completed' => 0, 'lost' => 0];
foreach ($q('SELECT stage, COUNT(*) n FROM clients GROUP BY stage') as $r) $stageCounts[$r['stage']] = (int)$r['n'];
$allClients = array_sum($stageCounts);
$won = $stageCounts['active'] + $stageCounts['completed'];
$conv = ($won + $stageCounts['lost'] + $stageCounts['lead']) > 0 ? round($won / ($won + $stageCounts['lost'] + $stageCounts['lead']) * 100) : 0;
$repeat = (int)$pdo->query('SELECT COUNT(*) FROM (SELECT client_id FROM orders GROUP BY client_id HAVING COUNT(*) > 1)')->fetchColumn();
$buyers = (int)$pdo->query('SELECT COUNT(DISTINCT client_id) FROM orders')->fetchColumn();

// money still to collect, by age of the order
$aging = ['0-7 days' => 0, '8-30 days' => 0, '31+ days' => 0];
foreach ($q('SELECT amount, paid_amount, order_date FROM orders WHERE COALESCE(amount,0) > COALESCE(paid_amount,0)') as $r) {
    $age = (int)((time() - strtotime(substr($r['order_date'], 0, 10))) / 86400);
    $key = $age <= 7 ? '0-7 days' : ($age <= 30 ? '8-30 days' : '31+ days');
    $aging[$key] += owed($r);
}

$pageTitle = 'Reports';
$page = 'reports';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="filters">
  <div class="tabs"><?php foreach ([3, 6, 12, 24] as $m): ?><a class="<?php echo $range === $m ? 'on' : ''; ?>" href="/dashboard/reports.php?months=<?php echo $m; ?>">Last <?php echo $m; ?> months</a><?php endforeach; ?></div>
</div>

<div class="stats">
  <div class="stat"><div class="num"><?php echo e(money($totRecv)); ?></div><div class="label">Received (<?php echo $range; ?> months)</div></div>
  <div class="stat"><div class="num"><?php echo e(money($totBilled)); ?></div><div class="label">Billed in orders</div></div>
  <div class="stat"><div class="num"><?php echo (int)$totOrders; ?></div><div class="label">Orders</div></div>
  <div class="stat"><div class="num"><?php echo $conv; ?>%</div><div class="label">Leads that became clients</div></div>
  <div class="stat"><div class="num"><?php echo $buyers ? round($repeat / $buyers * 100) : 0; ?>%</div><div class="label">Clients who ordered again</div></div>
</div>

<section class="card">
  <div class="card-head"><h2>Money by month</h2><span class="muted"><span class="dot dot-gold"></span> received &nbsp; <span class="dot dot-blue"></span> billed</span></div>
  <div class="bars two" role="img" aria-label="Received and billed per month">
    <?php foreach ($months as $m): ?>
      <div class="bar"><em><?php echo $m['recv'] > 0 ? e(number_format($m['recv'] / 1000, 1) . 'k') : ''; ?></em>
        <div class="pair"><i style="height:<?php echo max(2, round($m['recv'] / $maxM * 100)); ?>%"></i><i class="b" style="height:<?php echo max(2, round($m['billed'] / $maxM * 100)); ?>%"></i></div>
        <span><?php echo e($m['label']); ?></span></div>
    <?php endforeach; ?>
  </div>
</section>

<div class="grid2">
  <section class="card">
    <div class="card-head"><h2>By file type</h2></div>
    <?php if (!$byType): ?><div class="empty">No orders in this period.</div><?php else: ?>
    <div class="tablewrap"><table><thead><tr><th>Type</th><th class="num">Orders</th><th class="num">Files</th><th class="num">Billed</th><th class="num">Received</th></tr></thead><tbody>
      <?php foreach ($byType as $r): ?><tr><td><?php echo e($r['k']); ?></td><td class="num"><?php echo (int)$r['n']; ?></td><td class="num"><?php echo (int)$r['f']; ?></td><td class="num"><?php echo e(number_format($r['billed'])); ?></td><td class="num"><?php echo e(number_format($r['recv'])); ?></td></tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
  </section>
  <section class="card">
    <div class="card-head"><h2>Top courses</h2></div>
    <?php if (!$byCourse): ?><div class="empty">Add a course code to orders to see which courses sell most.</div><?php else: ?>
    <div class="tablewrap"><table><thead><tr><th>Course</th><th class="num">Orders</th><th class="num">Billed</th><th class="num">Received</th></tr></thead><tbody>
      <?php foreach ($byCourse as $r): ?><tr><td><a href="/dashboard/orders.php?course=<?php echo urlencode($r['k']); ?>"><strong><?php echo e($r['k']); ?></strong></a></td><td class="num"><?php echo (int)$r['n']; ?></td><td class="num"><?php echo e(number_format($r['billed'])); ?></td><td class="num"><?php echo e(number_format($r['recv'])); ?></td></tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
  </section>
</div>

<div class="grid2" style="margin-top:18px">
  <section class="card">
    <div class="card-head"><h2>Where clients come from</h2></div>
    <div class="tablewrap"><table><thead><tr><th>Source</th><th class="num">Clients</th><th class="num">Orders</th><th class="num">Received</th></tr></thead><tbody>
      <?php foreach ($bySource as $r): ?><tr><td><?php echo e($r['k']); ?></td><td class="num"><?php echo (int)$r['clients']; ?></td><td class="num"><?php echo (int)$r['n']; ?></td><td class="num"><?php echo e(number_format($r['recv'])); ?></td></tr><?php endforeach; ?>
      <?php if (!$bySource): ?><tr><td colspan="4" class="muted">No clients yet.</td></tr><?php endif; ?>
    </tbody></table></div>
    <p class="muted" style="margin-bottom:0">Fill the "Source" field on each client to make this accurate.</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Client funnel</h2></div>
    <ul class="list">
      <?php foreach (STAGES as $k => $v): ?><li><span><span class="badge b-<?php echo $k; ?>"><?php echo e($v); ?></span></span><strong><?php echo (int)$stageCounts[$k]; ?></strong></li><?php endforeach; ?>
      <li><span>All clients</span><strong><?php echo $allClients; ?></strong></li>
    </ul>
  </section>
</div>

<div class="grid2" style="margin-top:18px">
  <section class="card">
    <div class="card-head"><h2>Best clients</h2></div>
    <?php if (!$topClients): ?><div class="empty">No orders yet.</div><?php else: ?>
    <div class="tablewrap"><table><thead><tr><th>Client</th><th class="num">Orders</th><th class="num">Received</th><th class="num">Owes</th></tr></thead><tbody>
      <?php foreach ($topClients as $r): ?><tr><td><a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$r['id']; ?>"><?php echo e($r['name']); ?></a></td><td class="num"><?php echo (int)$r['n']; ?></td><td class="num"><?php echo e(number_format($r['recv'])); ?></td><td class="num"><?php echo $r['owes'] > 0 ? '<span class="due-over">' . e(number_format($r['owes'])) . '</span>' : '-'; ?></td></tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
  </section>
  <div>
    <section class="card">
      <div class="card-head"><h2>Still to collect</h2><a class="btn ghost sm" href="/dashboard/orders.php?payment=due">Open</a></div>
      <ul class="list"><?php foreach ($aging as $k => $v): ?><li><span><?php echo e($k); ?> old</span><strong<?php echo $v > 0 && $k === '31+ days' ? ' class="due-over"' : ''; ?>><?php echo e(money($v)); ?></strong></li><?php endforeach; ?></ul>
    </section>
    <section class="card">
      <div class="card-head"><h2>Payment methods</h2></div>
      <?php if (!$byMethod): ?><div class="empty">No payments recorded.</div><?php else: ?>
      <ul class="list"><?php foreach ($byMethod as $r): ?><li><span><?php echo e($r['k']); ?> <span class="muted">(<?php echo (int)$r['n']; ?>)</span></span><strong><?php echo e(money($r['s'])); ?></strong></li><?php endforeach; ?></ul><?php endif; ?>
    </section>
  </div>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
