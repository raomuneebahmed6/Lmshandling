<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

$action = $_GET['action'] ?? 'list';
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$PAY = ['unpaid' => 'Unpaid', 'partial' => 'Partial', 'paid' => 'Paid'];
$STAT = ORDER_STATUSES;
$err = '';

function clean_course($c) {
    return strtoupper(mb_substr(preg_replace('/[^A-Za-z0-9 \/-]/', '', trim((string)$c)), 0, 40));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? 'save';
    $oid = (int)($_POST['id'] ?? 0);

    if ($do === 'delete' && $oid) {
        if (!is_admin()) { http_response_code(403); exit('Only the admin can delete orders.'); }
        $s = $pdo->prepare('SELECT client_id FROM orders WHERE id=?');
        $s->execute([$oid]);
        $cid = $s->fetchColumn();
        $os = $pdo->prepare('SELECT * FROM orders WHERE id=?'); $os->execute([$oid]); $orow = $os->fetch(PDO::FETCH_ASSOC);
        if ($orow) {
            $ps = $pdo->prepare('SELECT * FROM payments WHERE order_id=?'); $ps->execute([$oid]);
            trash_put('order', ($orow['course_code'] ?: $orow['file_type']) . ' #' . $oid, ['order' => $orow, 'payments' => $ps->fetchAll(PDO::FETCH_ASSOC)]);
            audit('order deleted', '#' . $oid . ' ' . ($orow['course_code'] ?: $orow['file_type']));
        }
        $pdo->prepare('DELETE FROM orders WHERE id=?')->execute([$oid]);
        flash('Order deleted. The admin can restore it from Activity > Trash for 90 days.');
        redirect($cid ? '/dashboard/clients?action=view&id=' . $cid : '/dashboard/orders');
    }

    if (($do === 'paid' || $do === 'completed' || $do === 'sent') && $oid) {
        if ($do === 'paid') {
            $s = $pdo->prepare('SELECT amount, paid_amount FROM orders WHERE id=?');
            $s->execute([$oid]);
            if ($row = $s->fetch(PDO::FETCH_ASSOC)) {
                $left = owed($row);
                if ($left > 0) add_payment($pdo, $oid, $left, 'Other', date('Y-m-d'), 'Marked paid');
                else $pdo->prepare("UPDATE orders SET payment_status='paid' WHERE id=?")->execute([$oid]);
            }
        } else {
            $pdo->prepare('UPDATE orders SET status=? WHERE id=?')->execute([$do, $oid]);
        }
        audit('order ' . $do, '#' . $oid);
        flash('Order updated.');
        $b = (string)($_POST['back'] ?? '');
        redirect(strpos($b, '/dashboard/') === 0 ? $b : '/dashboard/orders');
    }

    if ($do === 'addpay' && $oid) {
        $ok = add_payment($pdo, $oid, $_POST['amount'] ?? 0, $_POST['method'] ?? '', $_POST['paid_at'] ?? '', trim($_POST['note'] ?? ''));
        if ($ok) audit('payment added', 'order #' . $oid . ' Rs. ' . (float)($_POST['amount'] ?? 0));
        flash($ok ? 'Payment recorded.' : 'Enter an amount above zero.', $ok ? 'ok' : 'err');
        redirect('/dashboard/orders?action=edit&id=' . $oid);
    }

    if ($do === 'delpay' && $oid) {
        if (!is_admin()) { http_response_code(403); exit('Only the admin can remove payments.'); }
        $pdo->prepare('DELETE FROM payments WHERE id=?')->execute([(int)($_POST['pay_id'] ?? 0)]);
        recalc_order($pdo, $oid);
        audit('payment removed', 'order #' . $oid);
        flash('Payment removed.');
        redirect('/dashboard/orders?action=edit&id=' . $oid);
    }

    $clientId = (int)($_POST['client_id'] ?? 0);
    $fileType = trim($_POST['file_type'] ?? '');
    $fileCount = max(0, (int)($_POST['file_count'] ?? 0));
    $amount = ($_POST['amount'] ?? '') !== '' ? max(0, (float)$_POST['amount']) : null;
    $st = array_key_exists($_POST['status'] ?? '', $STAT) ? $_POST['status'] : 'pending';
    $notes = trim($_POST['notes'] ?? '');
    $orderDate = valid_date($_POST['order_date'] ?? '') ? $_POST['order_date'] : date('Y-m-d');
    $course = clean_course($_POST['course_code'] ?? '');
    $exam = valid_date($_POST['exam_date'] ?? '') ? $_POST['exam_date'] : null;
    $filesNote = mb_substr(trim($_POST['files_note'] ?? ''), 0, 500);

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
        $pdo->prepare('UPDATE orders SET client_id=?, file_type=?, file_count=?, amount=?, status=?, notes=?, order_date=?, course_code=?, exam_date=?, files_note=? WHERE id=?')
            ->execute([$clientId, $fileType, $fileCount, $amount, $st, $notes, $orderDate, $course, $exam, $filesNote, $oid]);
        recalc_order($pdo, $oid);
        audit('order updated', '#' . $oid);
        flash('Order saved.');
        redirect('/dashboard/orders?action=edit&id=' . $oid);
    } else {
        $pdo->prepare('INSERT INTO orders (client_id, file_type, file_count, amount, status, notes, order_date, course_code, exam_date, files_note) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$clientId, $fileType, $fileCount, $amount, $st, $notes, $orderDate, $course, $exam, $filesNote]);
        $newId = (int)$pdo->lastInsertId();
        $got = ($_POST['paid_now'] ?? '') !== '' ? (float)$_POST['paid_now'] : 0;
        if ($got > 0) add_payment($pdo, $newId, $got, $_POST['method'] ?? '', $orderDate, 'Received with the order');
        else recalc_order($pdo, $newId);
        // a new order turns a lead into an active client
        $pdo->prepare("UPDATE clients SET stage='active' WHERE id=? AND stage='lead'")->execute([$clientId]);
        audit('order added', '#' . $newId . ' ' . ($course ?: $fileType));
        flash('Order added.');
        redirect('/dashboard/clients?action=view&id=' . $clientId);
    }
}

$clients = $pdo->query('SELECT id, name FROM clients ORDER BY name COLLATE NOCASE')->fetchAll(PDO::FETCH_ASSOC);
$courseList = $pdo->query("SELECT DISTINCT course_code FROM orders WHERE course_code IS NOT NULL AND course_code != '' ORDER BY course_code")->fetchAll(PDO::FETCH_COLUMN);
$pageTitle = 'Orders';
$page = 'orders';

if ($action === 'new' || $action === 'edit') {
    $order = ['id' => '', 'client_id' => (int)($_GET['client_id'] ?? 0), 'file_type' => FILE_TYPES[0], 'file_count' => 1, 'amount' => '',
        'payment_status' => 'unpaid', 'paid_amount' => 0, 'status' => 'pending', 'notes' => '', 'order_date' => date('Y-m-d'),
        'course_code' => '', 'exam_date' => '', 'files_note' => ''];
    $pays = [];
    if ($id) {
        $s = $pdo->prepare('SELECT * FROM orders WHERE id=?');
        $s->execute([$id]);
        if ($row = $s->fetch(PDO::FETCH_ASSOC)) {
            $order = $row;
            $order['order_date'] = substr($order['order_date'], 0, 10);
            $p = $pdo->prepare('SELECT * FROM payments WHERE order_id=? ORDER BY paid_at, id');
            $p->execute([$id]);
            $pays = $p->fetchAll(PDO::FETCH_ASSOC);
        }
    }
    if ($err) {
        foreach (['client_id', 'file_type', 'file_count', 'amount', 'status', 'notes', 'order_date', 'course_code', 'exam_date', 'files_note'] as $f) $order[$f] = $_POST[$f] ?? $order[$f];
    }
    $pageTitle = $order['id'] ? 'Edit order' : 'New order';
    include __DIR__ . '/includes/layout_top.php';
    ?>
<div class="grid2">
<div class="card">
  <?php if ($err): ?><div class="msg msg-err"><?php echo e($err); ?></div><?php endif; ?>
  <?php if (!$clients): ?><div class="msg msg-warn">Add a client first. <a href="/dashboard/clients?action=new">Add client</a></div><?php endif; ?>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="save"><input type="hidden" name="id" value="<?php echo e($order['id']); ?>">
    <div><label for="client">Client</label>
      <select id="client" name="client_id" required><option value="">Select client...</option>
        <?php foreach ($clients as $c): ?><option value="<?php echo (int)$c['id']; ?>"<?php echo (int)$order['client_id'] === (int)$c['id'] ? ' selected' : ''; ?>><?php echo e($c['name']); ?></option><?php endforeach; ?>
      </select></div>
    <div class="row2">
      <div><label for="ft">File type</label>
        <select id="ft" name="file_type"><?php foreach (FILE_TYPES as $ft): ?><option<?php echo $order['file_type'] === $ft ? ' selected' : ''; ?>><?php echo e($ft); ?></option><?php endforeach; ?></select></div>
      <div><label for="cc">Course code</label><input id="cc" name="course_code" list="courses" value="<?php echo e($order['course_code']); ?>" placeholder="e.g. STA301" autocomplete="off">
        <datalist id="courses"><?php foreach ($courseList as $cl): ?><option value="<?php echo e($cl); ?>"><?php endforeach; ?></datalist></div>
    </div>
    <div class="row2">
      <div><label for="fc">Number of files</label><input id="fc" type="number" name="file_count" min="0" value="<?php echo e($order['file_count']); ?>"></div>
      <div><label for="amt">Amount (Rs.)</label><input id="amt" type="number" name="amount" min="0" step="1" value="<?php echo e($order['amount']); ?>"></div>
    </div>
    <div class="row2">
      <div><label for="od">Order date</label><input id="od" type="date" name="order_date" value="<?php echo e($order['order_date']); ?>"></div>
      <div><label for="ed">Exam date (if known)</label><input id="ed" type="date" name="exam_date" value="<?php echo e($order['exam_date']); ?>"></div>
    </div>
    <div><label for="st">Order status</label>
      <select id="st" name="status"><?php foreach ($STAT as $k => $v): ?><option value="<?php echo $k; ?>"<?php echo $order['status'] === $k ? ' selected' : ''; ?>><?php echo $v; ?></option><?php endforeach; ?></select></div>
    <?php if (!$order['id']): ?>
    <div class="row2">
      <div><label for="pn">Received now (Rs.)</label><input id="pn" type="number" name="paid_now" min="0" step="1" placeholder="0"></div>
      <div><label for="pm">Method</label><select id="pm" name="method"><?php foreach (PAY_METHODS as $m): ?><option><?php echo e($m); ?></option><?php endforeach; ?></select></div>
    </div>
    <?php endif; ?>
    <div><label for="fn">Files sent (names or Google Drive link)</label><textarea id="fn" name="files_note" placeholder="e.g. STA301 midterm MCQs.pdf, drive link..."><?php echo e($order['files_note']); ?></textarea></div>
    <div><label for="on">Notes</label><textarea id="on" name="notes"><?php echo e($order['notes']); ?></textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="gold">Save order</button><a class="btn ghost" href="/dashboard/orders">Back to orders</a>
      <?php if ($order['id']): ?><a class="btn ghost" href="/dashboard/receipt?id=<?php echo (int)$order['id']; ?>" target="_blank">Receipt</a><?php endif; ?></div>
  </form>
  <?php if ($order['id'] && is_admin()): ?>
  <form method="post" data-confirm="Delete this order and its payments?" style="margin-top:14px"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo (int)$order['id']; ?>"><button type="submit" class="danger sm">Delete order</button></form>
  <?php endif; ?>
</div>

<?php if ($order['id']): $left = owed($order); ?>
<div class="card">
  <div class="card-head"><h2>Payments</h2><span class="badge b-<?php echo e($order['payment_status']); ?>"><?php echo e($order['payment_status']); ?></span></div>
  <p class="muted" style="margin-top:0">Total <?php echo e(money($order['amount'] ?? 0)); ?> &middot; received <strong><?php echo e(money($order['paid_amount'])); ?></strong> &middot; balance <strong<?php echo $left > 0 ? ' class="due-over"' : ''; ?>><?php echo e(money($left)); ?></strong></p>
  <?php if ($pays): ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($pays as $p): ?>
      <tr><td><?php echo e($p['paid_at']); ?></td><td><?php echo e($p['method']); ?><?php echo $p['note'] ? '<br><span class="muted">' . e($p['note']) . '</span>' : ''; ?></td><td class="num"><?php echo e(number_format($p['amount'])); ?></td>
        <td><?php if (is_admin()): ?><form method="post" class="inline" data-confirm="Remove this payment?"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delpay"><input type="hidden" name="id" value="<?php echo (int)$order['id']; ?>"><input type="hidden" name="pay_id" value="<?php echo (int)$p['id']; ?>"><button class="danger sm" type="submit">x</button></form><?php endif; ?></td></tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php else: ?><div class="empty">No payments yet.</div><?php endif; ?>
  <form method="post" class="stack" style="margin-top:14px">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="addpay"><input type="hidden" name="id" value="<?php echo (int)$order['id']; ?>">
    <div class="row2">
      <div><label for="pa">Add payment (Rs.)</label><input id="pa" type="number" name="amount" min="1" step="1" required value="<?php echo $left > 0 ? e((int)$left) : ''; ?>"></div>
      <div><label for="pm2">Method</label><select id="pm2" name="method"><?php foreach (PAY_METHODS as $m): ?><option><?php echo e($m); ?></option><?php endforeach; ?></select></div>
    </div>
    <div class="row2">
      <div><label for="pd">Date</label><input id="pd" type="date" name="paid_at" value="<?php echo e(date('Y-m-d')); ?>"></div>
      <div><label for="pnn">Note</label><input id="pnn" name="note" maxlength="200" placeholder="e.g. trx id"></div>
    </div>
    <div><button type="submit" class="gold sm">Record payment</button></div>
  </form>
</div>
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
$crf = clean_course($_GET['course'] ?? '');
$mf = $_GET['month'] ?? ''; if (!preg_match('/^\d{4}-\d{2}$/', $mf)) $mf = '';

$where = []; $params = [];
if ($pf === 'due') { $where[] = "o.payment_status != 'paid'"; }
elseif ($pf !== '') { $where[] = 'o.payment_status = ?'; $params[] = $pf; }
if ($sf !== '') { $where[] = 'o.status = ?'; $params[] = $sf; }
if ($cf) { $where[] = 'o.client_id = ?'; $params[] = $cf; }
if ($crf !== '') { $where[] = 'o.course_code = ?'; $params[] = $crf; }
if ($mf !== '') { $where[] = 'substr(o.order_date,1,7) = ?'; $params[] = $mf; }
$s = $pdo->prepare('SELECT o.*, c.name AS client_name FROM orders o JOIN clients c ON c.id=o.client_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY o.order_date DESC, o.id DESC LIMIT 500');
$s->execute($params);
$orders = $s->fetchAll(PDO::FETCH_ASSOC);
$sumAll = 0; $sumDue = 0; $files = 0;
foreach ($orders as $o) { $sumAll += (float)$o['amount']; $files += (int)$o['file_count']; $sumDue += owed($o); }
$back = '/dashboard/orders' . ($_SERVER['QUERY_STRING'] ? '?' . $_SERVER['QUERY_STRING'] : '');
$today = date('Y-m-d');

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
    <select name="course" data-autosubmit aria-label="Course filter"><option value="">All courses</option>
      <?php foreach ($courseList as $cl): ?><option<?php echo $crf === $cl ? ' selected' : ''; ?>><?php echo e($cl); ?></option><?php endforeach; ?></select>
    <select name="client" data-autosubmit aria-label="Client filter"><option value="">All clients</option>
      <?php foreach ($clients as $c): ?><option value="<?php echo (int)$c['id']; ?>"<?php echo $cf === (int)$c['id'] ? ' selected' : ''; ?>><?php echo e($c['name']); ?></option><?php endforeach; ?></select>
    <input type="month" name="month" value="<?php echo e($mf); ?>" aria-label="Month" data-autosubmit style="width:auto">
    <a class="btn ghost sm" href="/dashboard/orders">Reset</a>
    <a class="btn ghost sm" href="/dashboard/export?type=orders" style="margin-left:auto">Export CSV</a>
  </form>
  <?php if (!$orders): ?>
    <div class="empty">No orders match. <a href="/dashboard/orders?action=new">Create an order</a></div>
  <?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Client</th><th>Course / type</th><th>Exam</th><th class="num">Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($orders as $o): ?>
      <tr>
        <td><?php echo e(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$o['client_id']; ?>"><?php echo e($o['client_name']); ?></a></td>
        <td><?php echo $o['course_code'] ? '<strong>' . e($o['course_code']) . '</strong><br>' : ''; ?><span class="muted"><?php echo e($o['file_type']); ?> &middot; <?php echo (int)$o['file_count']; ?> file(s)</span></td>
        <td><?php if ($o['exam_date']): $d = (int)((strtotime($o['exam_date']) - strtotime($today)) / 86400); ?><span class="<?php echo $d < 0 ? 'muted' : ($d <= 3 ? 'due-over' : ($d <= 7 ? 'due-today' : '')); ?>"><?php echo e($o['exam_date']); ?></span><?php else: ?>-<?php endif; ?></td>
        <td class="num"><?php echo $o['amount'] !== null ? e(number_format($o['amount'])) : '-'; ?><?php if ($o['payment_status'] === 'partial'): ?><br><span class="muted">got <?php echo e(number_format($o['paid_amount'])); ?></span><?php endif; ?></td>
        <td><span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span></td>
        <td><span class="badge b-<?php echo e($o['status']); ?>"><?php echo e($STAT[$o['status']] ?? $o['status']); ?></span></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <?php if ($o['payment_status'] !== 'paid'): ?><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="paid"><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>"><input type="hidden" name="back" value="<?php echo e($back); ?>"><button class="ghost sm" type="submit">Mark paid</button></form><?php endif; ?>
          <?php if (!in_array($o['status'], ['sent', 'completed'], true)): ?><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="sent"><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>"><input type="hidden" name="back" value="<?php echo e($back); ?>"><button class="ghost sm" type="submit">Sent</button></form><?php endif; ?>
          <?php if ($o['status'] !== 'completed'): ?><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="completed"><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>"><input type="hidden" name="back" value="<?php echo e($back); ?>"><button class="ghost sm" type="submit">Complete</button></form><?php endif; ?>
          <a class="btn ghost sm" href="/dashboard/receipt?id=<?php echo (int)$o['id']; ?>" target="_blank">Receipt</a>
          <a class="btn ghost sm" href="/dashboard/orders?action=edit&amp;id=<?php echo (int)$o['id']; ?>">Edit</a>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
    <tfoot><tr><td colspan="3"><?php echo count($orders); ?> orders &middot; <?php echo $files; ?> files</td><td></td><td class="num"><?php echo e(number_format($sumAll)); ?></td><td colspan="3">Still to collect: <?php echo e(money($sumDue)); ?></td></tr></tfoot>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
