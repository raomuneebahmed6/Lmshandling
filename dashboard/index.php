<?php
require_once __DIR__ . '/includes/auth.php';
require_login();

$pdo = get_db();

$totalClients = $pdo->query('SELECT COUNT(*) FROM clients')->fetchColumn();
$totalOrders = $pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn();
$totalFiles = $pdo->query('SELECT COALESCE(SUM(file_count),0) FROM orders')->fetchColumn();
$monthOrders = $pdo->query("SELECT COUNT(*) FROM orders WHERE strftime('%Y-%m', order_date) = strftime('%Y-%m', 'now')")->fetchColumn();
$unpaidCount = $pdo->query("SELECT COUNT(*) FROM orders WHERE payment_status = 'unpaid'")->fetchColumn();

$recentOrders = $pdo->query("
    SELECT orders.*, clients.name AS client_name
    FROM orders
    JOIN clients ON clients.id = orders.client_id
    ORDER BY orders.order_date DESC
    LIMIT 10
")->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Dashboard';
$page = 'home';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="stats">
  <div class="stat"><div class="num"><?php echo $totalClients; ?></div><div class="label">Total Clients</div></div>
  <div class="stat"><div class="num"><?php echo $totalOrders; ?></div><div class="label">Total Orders</div></div>
  <div class="stat"><div class="num"><?php echo $totalFiles; ?></div><div class="label">Total Files Sent</div></div>
  <div class="stat"><div class="num"><?php echo $monthOrders; ?></div><div class="label">Orders This Month</div></div>
  <div class="stat"><div class="num"><?php echo $unpaidCount; ?></div><div class="label">Unpaid Orders</div></div>
</div>

<div class="card">
  <div class="toolbar">
    <h2 style="margin:0">Recent Orders</h2>
    <a href="/dashboard/orders.php?action=new" class="btn">+ New Order</a>
  </div>
  <?php if (empty($recentOrders)): ?>
    <p class="muted">No orders yet. <a href="/dashboard/clients.php?action=new">Add a client</a> first, then add an order.</p>
  <?php else: ?>
  <table>
    <thead><tr><th>Date</th><th>Client</th><th>File Type</th><th>Files</th><th>Payment</th><th>Status</th></tr></thead>
    <tbody>
      <?php foreach ($recentOrders as $o): ?>
      <tr>
        <td><?php echo htmlspecialchars(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients.php?action=view&id=<?php echo $o['client_id']; ?>"><?php echo htmlspecialchars($o['client_name']); ?></a></td>
        <td><?php echo htmlspecialchars($o['file_type']); ?></td>
        <td><?php echo (int)$o['file_count']; ?></td>
        <td><span class="badge badge-<?php echo $o['payment_status']; ?>"><?php echo htmlspecialchars($o['payment_status']); ?></span></td>
        <td><span class="badge badge-<?php echo $o['status']; ?>"><?php echo htmlspecialchars($o['status']); ?></span></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
