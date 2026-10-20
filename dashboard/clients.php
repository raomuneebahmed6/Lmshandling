<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$action = $_GET['action'] ?? 'list';
$id = isset($_GET['id']) ? (int)$_GET['id'] : null;
$msg = '';

// Handle form submissions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $whatsapp = trim($_POST['whatsapp_number'] ?? '');
    $course = trim($_POST['course'] ?? '');
    $notes = trim($_POST['notes'] ?? '');

    if ($name === '') {
        $msg = 'Name is required.';
    } else {
        if (!empty($_POST['id'])) {
            $stmt = $pdo->prepare('UPDATE clients SET name=?, whatsapp_number=?, course=?, notes=? WHERE id=?');
            $stmt->execute([$name, $whatsapp, $course, $notes, (int)$_POST['id']]);
            header('Location: /dashboard/clients.php?action=view&id=' . (int)$_POST['id']);
            exit;
        } else {
            $stmt = $pdo->prepare('INSERT INTO clients (name, whatsapp_number, course, notes) VALUES (?,?,?,?)');
            $stmt->execute([$name, $whatsapp, $course, $notes]);
            header('Location: /dashboard/clients.php?action=view&id=' . $pdo->lastInsertId());
            exit;
        }
    }
}

if ($action === 'delete' && $id) {
    $stmt = $pdo->prepare('DELETE FROM clients WHERE id=?');
    $stmt->execute([$id]);
    header('Location: /dashboard/clients.php');
    exit;
}

$pageTitle = 'Clients';
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';

if ($action === 'new' || $action === 'edit'):
    $client = ['id' => '', 'name' => '', 'whatsapp_number' => '', 'course' => '', 'notes' => ''];
    if ($action === 'edit' && $id) {
        $stmt = $pdo->prepare('SELECT * FROM clients WHERE id=?');
        $stmt->execute([$id]);
        $client = $stmt->fetch(PDO::FETCH_ASSOC);
    }
?>
<div class="card" style="max-width:480px">
  <h2 style="margin-top:0"><?php echo $action === 'edit' ? 'Edit' : 'Add'; ?> Client</h2>
  <?php if ($msg): ?><div class="msg msg-err"><?php echo htmlspecialchars($msg); ?></div><?php endif; ?>
  <form method="post">
    <input type="hidden" name="id" value="<?php echo htmlspecialchars($client['id']); ?>">
    <label>Name</label>
    <input type="text" name="name" value="<?php echo htmlspecialchars($client['name']); ?>" required>
    <label>WhatsApp Number</label>
    <input type="text" name="whatsapp_number" value="<?php echo htmlspecialchars($client['whatsapp_number']); ?>" placeholder="03XXXXXXXXX">
    <label>Course / Program</label>
    <input type="text" name="course" value="<?php echo htmlspecialchars($client['course']); ?>">
    <label>Notes</label>
    <textarea name="notes"><?php echo htmlspecialchars($client['notes']); ?></textarea>
    <button type="submit">Save Client</button>
  </form>
</div>

<?php elseif ($action === 'view' && $id):
    $stmt = $pdo->prepare('SELECT * FROM clients WHERE id=?');
    $stmt->execute([$id]);
    $client = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$client) { echo '<div class="card">Client not found. <a href="/dashboard/clients.php">Back to clients</a></div>'; include __DIR__ . '/includes/layout_bottom.php'; exit; }

    $stmt = $pdo->prepare('SELECT * FROM orders WHERE client_id=? ORDER BY order_date DESC');
    $stmt->execute([$id]);
    $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $fileTotal = array_sum(array_column($orders, 'file_count'));
?>
<div class="toolbar">
  <h2 style="margin:0"><?php echo htmlspecialchars($client['name']); ?></h2>
  <div>
    <a href="/dashboard/clients.php?action=edit&id=<?php echo $id; ?>" class="btn btn-outline btn-sm">Edit</a>
    <a href="/dashboard/clients.php?action=delete&id=<?php echo $id; ?>" class="btn btn-danger btn-sm" onclick="return confirm('Delete this client and all their orders?')">Delete</a>
  </div>
</div>
<div class="card">
  <p><strong>WhatsApp:</strong> <?php echo htmlspecialchars($client['whatsapp_number'] ?: '—'); ?>
  <?php if ($client['whatsapp_number']): ?>
    &nbsp;<a href="https://wa.me/<?php echo preg_replace('/\D/', '', $client['whatsapp_number']); ?>" target="_blank">Open chat</a>
  <?php endif; ?>
  </p>
  <p><strong>Course:</strong> <?php echo htmlspecialchars($client['course'] ?: '—'); ?></p>
  <p><strong>Notes:</strong> <?php echo nl2br(htmlspecialchars($client['notes'] ?: '—')); ?></p>
  <p class="muted">Total files sent: <strong><?php echo $fileTotal; ?></strong></p>
</div>

<div class="card">
  <div class="toolbar">
    <h3 style="margin:0">Orders</h3>
    <a href="/dashboard/orders.php?action=new&client_id=<?php echo $id; ?>" class="btn btn-sm">+ New Order</a>
  </div>
  <?php if (empty($orders)): ?>
    <p class="muted">No orders yet for this client.</p>
  <?php else: ?>
  <table>
    <thead><tr><th>Date</th><th>File Type</th><th>Files</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
    <tbody>
      <?php foreach ($orders as $o): ?>
      <tr>
        <td><?php echo htmlspecialchars(substr($o['order_date'], 0, 10)); ?></td>
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

<?php else:
    $search = trim($_GET['q'] ?? '');
    if ($search !== '') {
        $stmt = $pdo->prepare("SELECT * FROM clients WHERE name LIKE ? OR whatsapp_number LIKE ? OR course LIKE ? ORDER BY created_at DESC");
        $like = '%' . $search . '%';
        $stmt->execute([$like, $like, $like]);
    } else {
        $stmt = $pdo->query('SELECT * FROM clients ORDER BY created_at DESC');
    }
    $clients = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>
<div class="toolbar">
  <h2 style="margin:0">Clients</h2>
  <a href="/dashboard/clients.php?action=new" class="btn">+ Add Client</a>
</div>
<div class="card">
  <form method="get" class="search" style="flex-direction:row;gap:8px;margin-bottom:16px">
    <input type="text" name="q" value="<?php echo htmlspecialchars($search); ?>" placeholder="Search name, number, course...">
    <button type="submit" class="btn-sm">Search</button>
  </form>
  <?php if (empty($clients)): ?>
    <p class="muted">No clients yet.</p>
  <?php else: ?>
  <table>
    <thead><tr><th>Name</th><th>WhatsApp</th><th>Course</th><th>Added</th></tr></thead>
    <tbody>
      <?php foreach ($clients as $c): ?>
      <tr onclick="window.location='/dashboard/clients.php?action=view&id=<?php echo $c['id']; ?>'" style="cursor:pointer">
        <td><?php echo htmlspecialchars($c['name']); ?></td>
        <td><?php echo htmlspecialchars($c['whatsapp_number'] ?: '—'); ?></td>
        <td><?php echo htmlspecialchars($c['course'] ?: '—'); ?></td>
        <td><?php echo htmlspecialchars(substr($c['created_at'], 0, 10)); ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
  <?php endif; ?>
</div>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
