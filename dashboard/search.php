<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$q = trim($_GET['q'] ?? '');
$clients = []; $orders = []; $acts = [];
if ($q !== '') {
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
    $digits = preg_replace('/\D/', '', $q);
    $s = $pdo->prepare("SELECT * FROM clients WHERE name LIKE ? ESCAPE '\\' OR course LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR source LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR whatsapp_number LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 30");
    $s->execute([$like, $like, $like, $like, $like, $like]);
    $clients = $s->fetchAll(PDO::FETCH_ASSOC);
    if (strlen($digits) >= 6) {
        $have = array_column($clients, 'id');
        foreach ($pdo->query('SELECT * FROM clients') as $c) {
            if (!in_array($c['id'], $have, true) && strpos(wa_number($c['whatsapp_number']), wa_number($digits)) !== false) $clients[] = $c;
        }
    }
    $s = $pdo->prepare("SELECT o.*, c.name AS client_name FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.course_code LIKE ? ESCAPE '\\' OR o.file_type LIKE ? ESCAPE '\\' OR o.notes LIKE ? ESCAPE '\\' OR o.files_note LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' ORDER BY o.order_date DESC LIMIT 30");
    $s->execute([$like, $like, $like, $like, $like]);
    $orders = $s->fetchAll(PDO::FETCH_ASSOC);
    $s = $pdo->prepare("SELECT a.*, c.name AS client_name FROM activities a JOIN clients c ON c.id = a.client_id WHERE a.body LIKE ? ESCAPE '\\' ORDER BY a.created_at DESC LIMIT 15");
    $s->execute([$like]);
    $acts = $s->fetchAll(PDO::FETCH_ASSOC);
}

$pageTitle = 'Search';
$page = '';
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <form method="get" class="filters" style="margin-bottom:0">
    <input type="search" name="q" value="<?php echo e($q); ?>" placeholder="Name, number, course code, tag, note..." aria-label="Search" autofocus style="max-width:420px">
    <button type="submit">Search</button>
  </form>
</section>
<?php if ($q !== ''): ?>
<?php if (!$clients && !$orders && !$acts): ?><div class="card empty">Nothing found for "<?php echo e($q); ?>".</div><?php endif; ?>
<?php if ($clients): ?>
<section class="card">
  <div class="card-head"><h2>Clients <span class="badge b-partial"><?php echo count($clients); ?></span></h2></div>
  <div class="tablewrap"><table><thead><tr><th>Name</th><th>WhatsApp</th><th>Course</th><th>Stage</th></tr></thead><tbody>
    <?php foreach ($clients as $c): ?><tr data-href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$c['id']; ?>"><td><strong><?php echo e($c['name']); ?></strong><?php echo $c['tags'] ? '<br><span class="muted">' . e($c['tags']) . '</span>' : ''; ?></td><td><?php echo e($c['whatsapp_number'] ?: '-'); ?></td><td><?php echo e($c['course'] ?: '-'); ?></td><td><span class="badge b-<?php echo e($c['stage']); ?>"><?php echo e(STAGES[$c['stage']] ?? $c['stage']); ?></span></td></tr><?php endforeach; ?>
  </tbody></table></div>
</section>
<?php endif; ?>
<?php if ($orders): ?>
<section class="card">
  <div class="card-head"><h2>Orders <span class="badge b-partial"><?php echo count($orders); ?></span></h2></div>
  <div class="tablewrap"><table><thead><tr><th>Date</th><th>Client</th><th>Course / type</th><th class="num">Amount</th><th>Payment</th><th>Status</th></tr></thead><tbody>
    <?php foreach ($orders as $o): ?><tr data-href="/dashboard/orders.php?action=edit&amp;id=<?php echo (int)$o['id']; ?>"><td><?php echo e(substr($o['order_date'], 0, 10)); ?></td><td><?php echo e($o['client_name']); ?></td><td><?php echo e($o['course_code'] ?: $o['file_type']); ?></td><td class="num"><?php echo $o['amount'] !== null ? e(number_format($o['amount'])) : '-'; ?></td><td><span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span></td><td><span class="badge b-<?php echo e($o['status']); ?>"><?php echo e(ORDER_STATUSES[$o['status']] ?? $o['status']); ?></span></td></tr><?php endforeach; ?>
  </tbody></table></div>
</section>
<?php endif; ?>
<?php if ($acts): ?>
<section class="card">
  <div class="card-head"><h2>Activity notes</h2></div>
  <ul class="list"><?php foreach ($acts as $a): ?><li><span><a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$a['client_id']; ?>"><strong><?php echo e($a['client_name']); ?></strong></a><br><span class="muted"><?php echo e(substr($a['created_at'], 0, 16)); ?> &middot; <?php echo e(mb_substr($a['body'], 0, 140)); ?></span></span></li><?php endforeach; ?></ul>
</section>
<?php endif; ?>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
