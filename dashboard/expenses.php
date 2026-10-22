<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    if ($do === 'add') {
        $amount = (float)($_POST['amount'] ?? 0);
        $cat = trim($_POST['category'] ?? '');
        $cat = in_array($cat, EXPENSE_CATEGORIES, true) ? $cat : 'Other';
        $date = valid_date($_POST['spent_at'] ?? '') ? $_POST['spent_at'] : date('Y-m-d');
        if ($amount <= 0) {
            flash('Enter an amount above zero.', 'err');
        } else {
            $pdo->prepare('INSERT INTO expenses (spent_at, category, amount, note) VALUES (?,?,?,?)')->execute([$date, $cat, $amount, mb_substr(trim($_POST['note'] ?? ''), 0, 200)]);
            audit('expense added', $cat . ' Rs. ' . $amount);
            flash('Expense recorded.');
        }
    } elseif ($do === 'delete') {
        $pdo->prepare('DELETE FROM expenses WHERE id=?')->execute([(int)($_POST['id'] ?? 0)]);
        audit('expense removed', '#' . (int)($_POST['id'] ?? 0));
        flash('Expense removed.');
    }
    redirect('/dashboard/expenses.php' . (!empty($_POST['m']) ? '?m=' . urlencode($_POST['m']) : ''));
}

$m = $_GET['m'] ?? date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $m)) $m = date('Y-m');
$rows = $pdo->prepare('SELECT * FROM expenses WHERE substr(spent_at,1,7) = ? ORDER BY spent_at DESC, id DESC');
$rows->execute([$m]);
$rows = $rows->fetchAll(PDO::FETCH_ASSOC);
$total = array_sum(array_column($rows, 'amount'));
$byCat = [];
foreach ($rows as $r) $byCat[$r['category']] = ($byCat[$r['category']] ?? 0) + (float)$r['amount'];
arsort($byCat);
$s = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE substr(paid_at,1,7) = ?'); $s->execute([$m]);
$received = (float)$s->fetchColumn();
$profit = $received - $total;

$pageTitle = 'Expenses';
$page = 'expenses';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="stats">
  <div class="stat"><div class="num"><?php echo e(money($received)); ?></div><div class="label">Received in <?php echo e($m); ?></div></div>
  <div class="stat"><div class="num"><?php echo e(money($total)); ?></div><div class="label">Spent in <?php echo e($m); ?></div></div>
  <div class="stat<?php echo $profit < 0 ? ' alert' : ''; ?>"><div class="num"><?php echo e(money($profit)); ?></div><div class="label">Profit (received minus spent)</div></div>
</div>
<div class="grid2">
  <section class="card">
    <div class="card-head"><h2>Expenses</h2><form method="get" class="inline"><input type="month" name="m" value="<?php echo e($m); ?>" data-autosubmit aria-label="Month" style="width:auto"></form></div>
    <?php if (!$rows): ?><div class="empty">No expenses recorded for this month.</div><?php else: ?>
    <div class="tablewrap"><table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      <?php foreach ($rows as $r): ?><tr><td><?php echo e($r['spent_at']); ?></td><td><?php echo e($r['category']); ?></td><td class="muted"><?php echo e($r['note']); ?></td><td class="num"><?php echo e(number_format($r['amount'])); ?></td>
        <td><form method="post" class="inline" data-confirm="Remove this expense?"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo (int)$r['id']; ?>"><input type="hidden" name="m" value="<?php echo e($m); ?>"><button class="danger sm" type="submit">x</button></form></td></tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
    <?php if ($byCat): ?><ul class="list" style="margin-top:12px"><?php foreach ($byCat as $c => $v): ?><li><span><?php echo e($c); ?></span><strong><?php echo e(money($v)); ?></strong></li><?php endforeach; ?></ul><?php endif; ?>
  </section>
  <section class="card">
    <div class="card-head"><h2>Add an expense</h2></div>
    <form method="post" class="stack">
      <?php echo csrf_field(); ?><input type="hidden" name="do" value="add"><input type="hidden" name="m" value="<?php echo e($m); ?>">
      <div class="row2">
        <div><label for="ea">Amount (Rs.)</label><input id="ea" type="number" name="amount" min="1" step="1" required></div>
        <div><label for="ed">Date</label><input id="ed" type="date" name="spent_at" value="<?php echo e(date('Y-m-d')); ?>"></div>
      </div>
      <div><label for="ec">Category</label><select id="ec" name="category"><?php foreach (EXPENSE_CATEGORIES as $c): ?><option><?php echo e($c); ?></option><?php endforeach; ?></select></div>
      <div><label for="en">Note</label><input id="en" name="note" maxlength="200" placeholder="e.g. Facebook ad, Hostinger renewal"></div>
      <div><button type="submit" class="gold">Save expense</button></div>
    </form>
  </section>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
