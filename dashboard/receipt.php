<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$s = $pdo->prepare('SELECT o.*, c.name AS cname, c.whatsapp_number, c.course FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.id=?');
$s->execute([(int)($_GET['id'] ?? 0)]);
$o = $s->fetch(PDO::FETCH_ASSOC);
if (!$o) {
    http_response_code(404);
    exit('Order not found.');
}
$due = owed($o);
$no = 'NH-' . date('Y', strtotime($o['order_date'])) . '-' . str_pad((string)$o['id'], 4, '0', STR_PAD_LEFT);
$wa = wa_number($o['whatsapp_number']);
$summary = "Receipt $no\n" . $o['file_type'] . ' x ' . (int)$o['file_count'] . "\nTotal: " . money($o['amount'] ?? 0) . "\nReceived: " . money($o['paid_amount']) . "\nBalance: " . money($due) . "\nThank you, Nibaha Haq (lmshandling.com)";
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Receipt <?php echo e($no); ?></title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=3">
<script src="/dashboard/assets/dash.js?v=2" defer></script>
</head>
<body class="receipt-page">
<div class="receipt">
  <div class="r-head">
    <img src="/assets/logo.webp" alt="" width="56" height="56">
    <div><strong>Nibaha Haq</strong><br><span>VU Academic Support &middot; lmshandling.com<br>WhatsApp 0329 5209868</span></div>
    <div class="r-no"><b>RECEIPT</b><br><?php echo e($no); ?><br><span><?php echo e(substr($o['order_date'], 0, 10)); ?></span></div>
  </div>
  <p class="r-to">Billed to<br><strong><?php echo e($o['cname']); ?></strong><?php echo $o['course'] ? '<br>' . e($o['course']) : ''; ?></p>
  <table>
    <thead><tr><th>Description</th><th class="num">Files</th><th class="num">Amount</th></tr></thead>
    <tbody><tr><td><?php echo e($o['file_type']); ?><?php echo $o['notes'] ? '<br><span class="muted">' . e($o['notes']) . '</span>' : ''; ?></td><td class="num"><?php echo (int)$o['file_count']; ?></td><td class="num"><?php echo e(money($o['amount'] ?? 0)); ?></td></tr></tbody>
    <tfoot>
      <tr><td colspan="2">Received</td><td class="num"><?php echo e(money($o['paid_amount'])); ?></td></tr>
      <tr><td colspan="2">Balance due</td><td class="num"><?php echo e(money($due)); ?></td></tr>
    </tfoot>
  </table>
  <p class="r-status">Status: <span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo $o['payment_status'] === 'paid' ? 'PAID' : e(strtoupper($o['payment_status'])); ?></span></p>
  <p class="muted">Thank you for choosing Nibaha Haq. This is a payment acknowledgement for academic support services; lmshandling.com is not an official VU service.</p>
  <div class="r-actions">
    <button type="button" data-print>Print / Save as PDF</button>
    <?php if ($wa): ?><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode($summary); ?>">Send on WhatsApp</a><?php endif; ?>
    <button type="button" class="ghost" data-back>Back</button>
  </div>
</div>
</body>
</html>
