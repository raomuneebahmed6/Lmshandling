<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$today = date('Y-m-d');
$month = date('Y-m');
$q = function ($sql, $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); };

$totalClients = (int)$q('SELECT COUNT(*) FROM clients');
$activeClients = (int)$q("SELECT COUNT(*) FROM clients WHERE stage='active'");
$leads = (int)$q("SELECT COUNT(*) FROM clients WHERE stage='lead'");
$pendingOrders = (int)$q("SELECT COUNT(*) FROM orders WHERE status='pending'");
$monthRevenue = (float)$q("SELECT COALESCE(SUM(amount),0) FROM orders WHERE payment_status='paid' AND substr(order_date,1,7)=?", [$month]);
$outstanding = (float)$q("SELECT COALESCE(SUM(amount),0) FROM orders WHERE payment_status!='paid'");
$unpaidCount = (int)$q("SELECT COUNT(*) FROM orders WHERE payment_status!='paid'");
$filesTotal = (int)$q('SELECT COALESCE(SUM(file_count),0) FROM orders');
$dueCount = (int)$q("SELECT COUNT(*) FROM clients WHERE next_followup IS NOT NULL AND next_followup!='' AND next_followup<=? AND stage IN ('lead','active')", [$today]);

// revenue (paid) for the last 6 months
$months = [];
for ($i = 5; $i >= 0; $i--) {
    $k = date('Y-m', strtotime("first day of -$i month"));
    $months[$k] = ['label' => date('M', strtotime($k . '-01')), 'sum' => 0.0];
}
$stmt = $pdo->prepare("SELECT substr(order_date,1,7) m, COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid' AND substr(order_date,1,7)>=? GROUP BY m");
$stmt->execute([array_key_first($months)]);
foreach ($stmt as $r) { if (isset($months[$r['m']])) $months[$r['m']]['sum'] = (float)$r['s']; }
$maxSum = max(1, max(array_column($months, 'sum')));

$due = $pdo->prepare("SELECT id, name, whatsapp_number, next_followup, stage FROM clients WHERE next_followup IS NOT NULL AND next_followup!='' AND next_followup<=? AND stage IN ('lead','active') ORDER BY next_followup LIMIT 6");
$due->execute([$today]);
$dueList = $due->fetchAll(PDO::FETCH_ASSOC);

$recent = $pdo->query("SELECT orders.*, clients.name AS client_name FROM orders JOIN clients ON clients.id = orders.client_id ORDER BY orders.order_date DESC, orders.id DESC LIMIT 8")->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Home';
$page = 'home';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="stats">
  <div class="stat"><div class="num"><?php echo $totalClients; ?></div><div class="label">Clients (<?php echo $activeClients; ?> active, <?php echo $leads; ?> leads)</div></div>
  <div class="stat"><div class="num"><?php echo $pendingOrders; ?></div><div class="label">Pending orders</div></div>
  <div class="stat"><div class="num"><?php echo e(money($monthRevenue)); ?></div><div class="label">Paid this month</div></div>
  <div class="stat<?php echo $outstanding > 0 ? ' alert' : ''; ?>"><div class="num"><?php echo e(money($outstanding)); ?></div><div class="label">Outstanding (<?php echo $unpaidCount; ?> orders)</div></div>
  <div class="stat"><div class="num"><?php echo $filesTotal; ?></div><div class="label">Files sent in total</div></div>
</div>

<div class="grid2">
  <section class="card">
    <div class="card-head"><h2>Paid revenue, last 6 months</h2></div>
    <div class="bars" role="img" aria-label="Paid revenue per month">
      <?php foreach ($months as $m): ?>
        <div class="bar"><em><?php echo $m['sum'] > 0 ? e(number_format($m['sum'] / 1000, 1) . 'k') : ''; ?></em><i style="height:<?php echo max(2, round($m['sum'] / $maxSum * 100)); ?>%"></i><span><?php echo e($m['label']); ?></span></div>
      <?php endforeach; ?>
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Follow-ups due <?php if ($dueCount): ?><span class="badge b-unpaid"><?php echo $dueCount; ?></span><?php endif; ?></h2><a class="btn ghost sm" href="/dashboard/followups.php">See all</a></div>
    <?php if (!$dueList): ?>
      <div class="empty">Nothing due. You are all caught up.</div>
    <?php else: ?>
    <ul class="list">
      <?php foreach ($dueList as $c): $over = $c['next_followup'] < $today; ?>
      <li>
        <span><a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$c['id']; ?>"><strong><?php echo e($c['name']); ?></strong></a><br><span class="muted <?php echo $over ? 'due-over' : 'due-today'; ?>"><?php echo $over ? 'Overdue since ' : 'Today, '; ?><?php echo e($c['next_followup']); ?></span></span>
        <?php if (wa_number($c['whatsapp_number'])): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e(wa_number($c['whatsapp_number'])); ?>">WhatsApp</a><?php endif; ?>
      </li>
      <?php endforeach; ?>
    </ul>
    <?php endif; ?>
  </section>
</div>

<section class="card" style="margin-top:18px">
  <div class="card-head"><h2>Recent orders</h2><a class="btn ghost sm" href="/dashboard/orders.php">All orders</a></div>
  <?php if (!$recent): ?>
    <div class="empty">No orders yet. Add your first client, then create an order for them.</div>
  <?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Client</th><th>Type</th><th class="num">Files</th><th class="num">Amount</th><th>Payment</th><th>Status</th></tr></thead>
    <tbody>
    <?php foreach ($recent as $o): ?>
      <tr data-href="/dashboard/orders.php?action=edit&amp;id=<?php echo (int)$o['id']; ?>">
        <td><?php echo e(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$o['client_id']; ?>"><?php echo e($o['client_name']); ?></a></td>
        <td><?php echo e($o['file_type']); ?></td>
        <td class="num"><?php echo (int)$o['file_count']; ?></td>
        <td class="num"><?php echo $o['amount'] !== null ? e(number_format($o['amount'])) : '-'; ?></td>
        <td><span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span></td>
        <td><span class="badge b-<?php echo e($o['status']); ?>"><?php echo e($o['status']); ?></span></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
