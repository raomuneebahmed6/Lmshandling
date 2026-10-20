<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$action = $_GET['action'] ?? 'list';
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$fileTypes = ['Midterm Files', 'Finalterm Files', 'Notes', 'FYP / GDB', 'Other'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $clientId = (int)$_POST['client_id'];
    $fileType = trim($_POST['file_type'] ?? '');
    $fileCount = (int)($_POST['file_count'] ?? 0);
    $amount = $_POST['amount'] !== '' ? (float)$_POST['amount'] : null;
    $paymentStatus = $_POST['payment_status'] ?? 'unpaid';
    $status = $_POST['status'] ?? 'pending';
    $notes = trim($_POST['notes'] ?? '');
    $orderDate = $_POST['order_date'] ?: date('Y-m-d');

    if (!empty($_POST['id'])) {
        $stmt = $pdo->prepare('UPDATE orders SET client_id=?, file_type=?, file_count=?, amount=?, payment_status=?, status=?, notes=?, order_date=? WHERE id=?');
        $stmt->execute([$clientId, $fileType, $fileCount, $amount, $paymentStatus, $status, $notes, $orderDate, (int)$_POST['id']]);
        header('Location: /dashboard/clients.php?action=view&id=' . $clientId);
        exit;
    } else {
        $stmt = $pdo->prepare('INSERT INTO orders (client_id, file_type, file_count, amount, payment_status, status, notes, order_date) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$clientId, $fileType, $fileCount, $amount, $paymentStatus, $status, $notes, $orderDate]);
        header('Location: /dashboard/clients.php?action=view&id=' . $clientId);
        exit;
    }
}

if ($action === 'delete' && $id) {
    $stmt = $pdo->prepare('SELECT client_id FROM orders WHERE id=?');
    $stmt->execute([$id]);
    $clientId = $stmt->fetchColumn();
    $pdo->prepare('DELETE FROM orders WHERE id=?')->execute([$id]);
    header('Location: /dashboard/clients.php?action=view&id=' . $clientId);
    exit;
}

$clients = $pdo->query('SELECT id, name FROM clients ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Orders';
$page = 'orders';
include __DIR__ . '/includes/layout_top.php';

if ($action === 'new' || $action === 'edit'):
    $order = [
        'id' => '', 'client_id' => $_GET['client_id'] ?? '', 'file_type' => $fileTypes[0],
        'file_count' => 1, 'amount' => '', 'payment_status' => 'unpaid', 'status' => 'pending',
        'notes' => '', 'order_date' => date('Y-m-d'),
    ];
    if ($action === 'edit' && $id) {
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id=?');
        $stmt->execute([$id]);
        $order = $stmt->fetch(PDO::FETCH_ASSOC);
        $order['order_date'] = substr($order['order_date'], 0, 10);
    }
?>
<div class="card" style="max-width:480px">
  <h2 style="margin-top:0"><?php echo $action === 'edit' ? 'Edit' : 'New'; ?> Order</h2>
  <form method="post">
    <input type="hidden" name="id" value="<?php echo htmlspecialchars($order['id']); ?>">
    <label>Client</label>
    <select name="client_id" required>
      <option value="">Select client...</option>
      <?php foreach ($clients as $c): ?>
        <option value="<?php echo $c['id']; ?>" <?php echo ($order['client_id'] == $c['id']) ? 'selected' : ''; ?>><?php echo htmlspecialchars($c['name']); ?></option>
      <?php endforeach; ?>
    </select>
    <label>File Type</label>
    <select name="file_type">
      <?php foreach ($fileTypes as $ft): ?>
        <option value="<?php echo htmlspecialchars($ft); ?>" <?php echo ($order['file_type'] === $ft) ? 'selected' : ''; ?>><?php echo htmlspecialchars($ft); ?></option>
      <?php endforeach; ?>
    </select>
    <label>Number of Files</label>
    <input type="number" name="file_count" min="0" value="<?php echo htmlspecialchars($order['file_count']); ?>">
    <label>Amount (Rs.)</label>
    <input type="number" name="amount" min="0" step="0.01" value="<?php echo htmlspecialchars($order['amount']); ?>">
    <label>Payment Status</label>
    <select name="payment_status">
      <option value="unpaid" <?php echo $order['payment_status']==='unpaid'?'selected':''; ?>>Unpaid</option>
      <option value="paid" <?php echo $order['payment_status']==='paid'?'selected':''; ?>>Paid</option>
    </select>
    <label>Order Status</label>
    <select name="status">
      <option value="pending" <?php echo $order['status']==='pending'?'selected':''; ?>>Pending</option>
      <option value="completed" <?php echo $order['status']==='completed'?'selected':''; ?>>Completed</option>
    </select>
    <label>Order Date</label>
    <input type="date" name="order_date" value="<?php echo htmlspecialchars($order['order_date']); ?>">
    <label>Notes</label>
    <textarea name="notes"><?php echo htmlspecialchars($order['notes']); ?></textarea>
    <button type="submit">Save Order</button>
  </form>
</div>

<?php else:
    $stmt = $pdo->query("
        SELECT orders.*, clients.name AS client_name
        FROM orders JOIN clients ON clients.id = orders.client_id
        ORDER BY orders.order_date DESC
    ");
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>
<div class="toolbar">
  <h2 style="margin:0">Orders</h2>
  <a href="/dashboard/orders.php?action=new" class="btn">+ New Order</a>
</div>
<div class="card">
  <?php if (empty($orders)): ?>
    <p class="muted">No orders yet.</p>
  <?php else: ?>
  <table>
    <thead><tr><th>Date</th><th>Client</th><th>File Type</th><th>Files</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
    <tbody>
      <?php foreach ($orders as $o): ?>
      <tr>
        <td><?php echo htmlspecialchars(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients.php?action=view&id=<?php echo $o['client_id']; ?>"><?php echo htmlspecialchars($o['client_name']); ?></a></td>
        <td><?php echo htmlspecialchars($o['file_type']); ?></td>
        <td><?php echo (int)$o['file_count']; ?></td>
        <td><?php echo $o['amount'] !== null ? number_format($o['amount']) : '—'; ?></td>
        <td><span class="badge badge-<?php echo $o['payment_status']; ?>"><?php echo htmlspecialchars($o['payment_status']); ?></span></td>
        <td><span class="badge badge-<?php echo $o['status']; ?>"><?php echo htmlspecialchars($o['status']); ?></span></td>
        <td><a href="/dashboard/orders.php?action=edit&id=<?php echo $o['id']; ?>" class="btn btn-outline btn-sm">Edit</a></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
