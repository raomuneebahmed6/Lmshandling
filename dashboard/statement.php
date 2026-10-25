<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$s = $pdo->prepare('SELECT * FROM clients WHERE id = ?');
$s->execute([(int)($_GET['client'] ?? 0)]);
$c = $s->fetch(PDO::FETCH_ASSOC);
if (!$c) { http_response_code(404); exit('Client not found.'); }

$s = $pdo->prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY order_date, id');
$s->execute([$c['id']]);
$orders = $s->fetchAll(PDO::FETCH_ASSOC);
$pay = $pdo->prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at, id');
$billed = 0; $recv = 0;
foreach ($orders as $i => $o) {
    $pay->execute([$o['id']]);
    $orders[$i]['pays'] = $pay->fetchAll(PDO::FETCH_ASSOC);
    $billed += (float)$o['amount']; $recv += (float)$o['paid_amount'];
}
$bal = max($billed - $recv, 0);
$wa = wa_number($c['whatsapp_number']);
$msg = "Statement for {$c['name']}\nTotal billed: " . money($billed) . "\nReceived: " . money($recv) . "\nBalance: " . money($bal) . "\nThank you, Nibaha Haq (lmshandling.com)";
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Statement - <?php echo e($c['name']); ?></title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=8">
<script src="/dashboard/assets/dash.js?v=7" defer></script>
</head>
<body class="receipt-page">
<div class="receipt">
  <div class="r-head">
    <img src="/assets/logo.webp" alt="" width="56" height="56">
    <div><strong>Nibaha Haq</strong><br><span>VU Academic Support &middot; lmshandling.com<br>WhatsApp 0329 5209868</span></div>
    <div class="r-no"><b>STATEMENT</b><br><span><?php echo e(date('Y-m-d')); ?></span></div>
  </div>
  <p class="r-to">Account of<br><strong><?php echo e($c['name']); ?></strong><?php echo $c['course'] ? '<br>' . e($c['course']) : ''; ?></p>
  <?php if (!$orders): ?><p class="muted">No orders yet.</p><?php else: ?>
  <table>
    <thead><tr><th>Date</th><th>Order</th><th class="num">Billed</th><th class="num">Paid</th></tr></thead>
    <tbody>
    <?php foreach ($orders as $o): ?>
      <tr><td><?php echo e(substr($o['order_date'], 0, 10)); ?></td><td><?php echo $o['course_code'] ? e($o['course_code']) . ' &middot; ' : ''; ?><?php echo e($o['file_type']); ?></td><td class="num"><?php echo e(number_format((float)$o['amount'])); ?></td><td class="num"><?php echo e(number_format((float)$o['paid_amount'])); ?></td></tr>
      <?php foreach ($o['pays'] as $p): ?><tr><td class="muted"><?php echo e($p['paid_at']); ?></td><td class="muted" colspan="2">payment (<?php echo e($p['method']); ?>)</td><td class="num muted"><?php echo e(number_format($p['amount'])); ?></td></tr><?php endforeach; ?>
    <?php endforeach; ?>
    </tbody>
    <tfoot>
      <tr><td colspan="2">Total billed</td><td class="num" colspan="2"><?php echo e(money($billed)); ?></td></tr>
      <tr><td colspan="2">Total received</td><td class="num" colspan="2"><?php echo e(money($recv)); ?></td></tr>
      <tr><td colspan="2">Balance due</td><td class="num" colspan="2"><?php echo e(money($bal)); ?></td></tr>
    </tfoot>
  </table>
  <?php endif; ?>
  <div class="r-actions">
    <button type="button" data-print>Print / Save as PDF</button>
    <?php if ($wa): ?><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode($msg); ?>">Send on WhatsApp</a><?php endif; ?>
    <button type="button" class="ghost" data-back>Back</button>
  </div>
</div>
</body>
</html>
