<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$action = $_GET['action'] ?? 'list';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$PAY = ['unpaid' => 'Unpaid', 'partial' => 'Partial', 'paid' => 'Paid'];
$STAT = ['pending' => 'Pending', 'completed' => 'Completed'];
$err = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? 'save';
    $oid = (int)($_POST['id'] ?? 0);

    if ($do === 'delete' && $oid) {
        $s = $pdo->prepare('SELECT client_id FROM orders WHERE id=?');
        $s->execute([$oid]);
        $cid = $s->fetchColumn();
        $pdo->prepare('DELETE FROM orders WHERE id=?')->execute([$oid]);
        flash('Order deleted.');
        redirect($cid ? '/dashboard/clients.php?action=view&id=' . $cid : '/dashboard/orders.php');
    }

    if (($do === 'paid' || $do === 'completed') && $oid) {
        if ($do === 'paid') {
            $pdo->prepare("UPDATE orders SET payment_status='paid', paid_amount=COALESCE(amount,0) WHERE id=?")->execute([$oid]);
        } else {
            $pdo->prepare("UPDATE orders SET status='completed' WHERE id=?")->execute([$oid]);
        }
        flash('Order updated.');
        $b = (string)($_POST['back'] ?? '');
        redirect(strpos($b, '/dashboard/orders.php') === 0 ? $b : '/dashboard/orders.php');
    }

    $clientId = (int)($_POST['client_id'] ?? 0);
    $fileType = trim($_POST['file_type'] ?? '');
    $fileCount = max(0, (int)($_POST['file_count'] ?? 0));
    $amount = ($_POST['amount'] ?? '') !== '' ? max(0, (float)$_POST['amount']) : null;
    $paidAmt = ($_POST['paid_amount'] ?? '') !== '' ? max(0, (float)$_POST['paid_amount']) : 0.0;
    $pay = pay_status($amount, $paidAmt);
    $st = array_key_exists($_POST['status'] ?? '', $STAT) ? $_POST['status'] : 'pending';
    $notes = trim($_POST['notes'] ?? '');
    $orderDate = valid_date($_POST['order_date'] ?? '') ? $_POST['order_date'] : date('Y-m-d');

    $exists = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE id=?');
    $exists->execute([$clientId]);
    if (!$clientId || !$exists->fetchColumn()) {
        $err = 'Please choose a client.';
        $action = $oid ? 'edit' : 'new';
        $id = $oid;
    } elseif ($fileType === '') {
        $err = 'Please choose a file type.';
        $action = $oid ? 'edit' : 'new';
        $id = $oid;
    } elseif ($oid) {
        $pdo->prepare('UPDATE orders SET client_id=?, file_type=?, file_count=?, amount=?, payment_status=?, paid_amount=?, status=?, notes=?, order_date=? WHERE id=?')
            ->execute([$clientId, $fileType, $fileCount, $amount, $pay, $paidAmt, $st, $notes, $orderDate, $oid]);
        flash('Order saved.');
        redirect('/dashboard/clients.php?action=view&id=' . $clientId);
    } else {
        $pdo->prepare('INSERT INTO orders (client_id, file_type, file_count, amount, payment_status, paid_amount, status, notes, order_date) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([$clientId, $fileType, $fileCount, $amount, $pay, $paidAmt, $st, $notes, $orderDate]);
        // a new order turns a lead into an active client
        $pdo->prepare("UPDATE clients SET stage='active' WHERE id=? AND stage='lead'")->execute([$clientId]);
        flash('Order added.');
        redirect('/dashboard/clients.php?action=view&id=' . $clientId);
    }
}

$clients = $pdo->query('SELECT id, name FROM clients ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
$pageTitle = 'Orders';
$page = 'orders';

if ($action === 'new' || $action === 'edit') {
    $order = ['id' => '', 'client_id' => (int)($_GET['client_id'] ?? 0), 'file_type' => FILE_TYPES[0], 'file_count' => 1, 'amount' => '',
        'payment_status' => 'unpaid', 'paid_amount' => '', 'status' => 'pending', 'notes' => '', 'order_date' => date('Y-m-d')];
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM orders WHERE id=?');
        $s->execute([$id]);
        if ($row = $s->fetch(PDO::FETCH_ASSOC)) {
            $order = $row;
            $order['order_date'] = substr($order['order_date'], 0, 10);
        }
    }
    if ($err) {
        foreach (['client_id', 'file_type', 'file_count', 'amount', 'paid_amount', 'status', 'notes', 'order_date'] as $f) $order[$f] = $_POST[$f] ?? $order[$f];
    }
    $pageTitle = $order['id'] ? 'Edit order' : 'New order';
    include __DIR__ . '/includes/layout_top.php';
    ?>
<div class="card" style="max-width:640px">
  <?php if ($err): ?><div class="msg msg-err"><?php echo e($err); ?></div><?php endif; ?>
  <?php if (!$clients): ?><div class="msg msg-warn">Add a client first. <a href="/dashboard/clients.php?action=new">Add client</a></div><?php endif; ?>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="save"><input type="hidden" name="id" value="<?php echo e($order['id']); ?>">
    <div><label for="client">Client</label>
      <select id="client" name="client_id" required><option value="">Select client...</option>
        <?php foreach ($clients as $c): ?><option value="<?php echo (int)$c['id']; ?>"<?php echo (int)$order['client_id'] === (int)$c['id'] ? ' selected' : ''; ?>><?php echo e($c['name']); ?></option><?php endforeach; ?>
      </select></div>
    <div class="row2">
      <div><label for="ft">File type</label>
        <select id="ft" name="file_type"><?php foreach (FILE_TYPES as $ft): ?><option<?php echo $order['file_type'] === $ft ? ' selected' : ''; ?>><?php echo e($ft); ?></option><?php endforeach; ?></select></div>
      <div><label for="fc">Number of files</label><input id="fc" type="number" name="file_count" min="0" value="<?php echo e($order['file_count']); ?>"></div>
    </div>
    <div class="row2">
      <div><label for="amt">Amount (Rs.)</label><input id="amt" type="number" name="amount" min="0" step="1" value="<?php echo e($order['amount']); ?>"></div>
      <div><label for="od">Order date</label><input id="od" type="date" name="order_date" value="<?php echo e($order['order_date']); ?>"></div>
    </div>
    <div class="row2">
      <div><label for="pa">Amount received so far (Rs.)</label><input id="pa" type="number" name="paid_amount" min="0" step="1" value="<?php echo e((float)$order['paid_amount'] == 0 ? '' : $order['paid_amount']); ?>" placeholder="0"></div>
      <div><label for="st">Order status</label>
        <select id="st" name="status"><?php foreach ($STAT as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $order['status'] === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?></select></div>
    </div>
    <div><label for="on">Notes</label><textarea id="on" name="notes"><?php echo e($order['notes']); ?></textarea></div>
    <div style="display:flex;gap:10px"><button type="submit" class="gold">Save order</button><a class="btn ghost" href="/dashboard/orders.php">Cancel</a></div>
  </form>
  <?php if ($order['id']): ?>
  <form method="post" data-confirm="Delete this order?" style="margin-top:14px"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo (int)$order['id']; ?>"><button type="submit" class="danger sm">Delete order</button></form>
  <?php endif; ?>
</div>
<?php
    include __DIR__ . '/includes/layout_bottom.php';
    exit;
}

// ---------- list with filters ----------
$pf = $_GET['payment'] ?? ''; if (!isset($PAY[$pf]) && $pf !== 'due') $pf = '';
$sf = $_GET['status'] ?? ''; if (!isset($STAT[$sf])) $sf = '';
$cf = (int)($_GET['client'] ?? 0);
$mf = $_GET['month'] ?? ''; if (!preg_match('/^\d{4}-\d{2}$/', $mf)) $mf = '';

$where = []; $params = [];
if ($pf === 'due') { $where[] = "o.payment_status != 'paid'"; }
elseif ($pf !== '') { $where[] = 'o.payment_status = ?'; $params[] = $pf; }
if ($sf !== '') { $where[] = 'o.status = ?'; $params[] = $sf; }
if ($cf) { $where[] = 'o.client_id = ?'; $params[] = $cf; }
if ($mf !== '') { $where[] = 'substr(o.order_date,1,7) = ?'; $params[] = $mf; }
$s = $pdo->prepare('SELECT o.*, c.name AS client_name FROM orders o JOIN clients c ON c.id=o.client_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY o.order_date DESC, o.id DESC LIMIT 500');
$s->execute($params);
$orders = $s->fetchAll(PDO::FETCH_ASSOC);
$sumAll = 0; $sumDue = 0; $files = 0;
foreach ($orders as $o) { $sumAll += (float)$o['amount']; $files += (int)$o['file_count']; $sumDue += owed($o); }
$back = '/dashboard/orders.php' . ($_SERVER['QUERY_STRING'] ? '?' . $_SERVER['QUERY_STRING'] : '');

include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <form method="get" class="filters">
    <select name="payment" data-autosubmit aria-label="Payment filter">
      <option value="">All payments</option><option value="due"<?php echo $pf === 'due' ? ' selected' : ''; ?>>Not fully paid</option>
      <?php foreach ($PAY as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $pf === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?>
    </select>
    <select name="status" data-autosubmit aria-label="Status filter"><option value="">All statuses</option>
      <?php foreach ($STAT as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $sf === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?></select>
    <select name="client" data-autosubmit aria-label="Client filter"><option value="">All clients</option>
      <?php foreach ($clients as $c): ?><option value="<?php echo (int)$c['id']; ?>"<?php echo $cf === (int)$c['id'] ? ' selected' : ''; ?>><?php echo e($c['name']); ?></option><?php endforeach; ?></select>
    <input type="month" name="month" value="<?php echo e($mf); ?>" aria-label="Month" data-autosubmit style="width:auto">
    <a class="btn ghost sm" href="/dashboard/orders.php">Reset</a>
    <a class="btn ghost sm" href="/dashboard/export.php?type=orders" style="margin-left:auto">Export CSV</a>
  </form>
  <?php if (!$orders): ?>
    <div class="empty">No orders match. <a href="/dashboard/orders.php?action=new">Create an order</a></div>
  <?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Client</th><th>Type</th><th class="num">Files</th><th class="num">Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($orders as $o): ?>
      <tr>
        <td><?php echo e(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$o['client_id']; ?>"><?php echo e($o['client_name']); ?></a></td>
        <td><?php echo e($o['file_type']); ?></td>
        <td class="num"><?php echo (int)$o['file_count']; ?></td>
        <td class="num"><?php echo $o['amount'] !== null ? e(number_format($o['amount'])) : '-'; ?><?php if ($o['payment_status'] === 'partial'): ?><br><span class="muted">got <?php echo e(number_format($o['paid_amount'])); ?></span><?php endif; ?></td>
        <td><span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span></td>
        <td><span class="badge b-<?php echo e($o['status']); ?>"><?php echo e($o['status']); ?></span></td>
        <td style="display:flex;gap:6px">
          <?php if ($o['payment_status'] !== 'paid'): ?><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="paid"><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>"><input type="hidden" name="back" value="<?php echo e($back); ?>"><button class="ghost sm" type="submit">Mark paid</button></form><?php endif; ?>
          <?php if ($o['status'] !== 'completed'): ?><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="completed"><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>"><input type="hidden" name="back" value="<?php echo e($back); ?>"><button class="ghost sm" type="submit">Complete</button></form><?php endif; ?>
          <a class="btn ghost sm" href="/dashboard/receipt.php?id=<?php echo (int)$o['id']; ?>" target="_blank">Receipt</a>
          <a class="btn ghost sm" href="/dashboard/orders.php?action=edit&amp;id=<?php echo (int)$o['id']; ?>">Edit</a>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
    <tfoot><tr><td colspan="3"><?php echo count($orders); ?> orders</td><td class="num"><?php echo $files; ?></td><td class="num"><?php echo e(number_format($sumAll)); ?></td><td colspan="3">Still to collect: <?php echo e(money($sumDue)); ?></td></tr></tfoot>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
