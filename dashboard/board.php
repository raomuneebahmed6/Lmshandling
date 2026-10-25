<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $oid = (int)($_POST['id'] ?? 0);
    $to = $_POST['to'] ?? '';
    if ($oid && array_key_exists($to, ORDER_STATUSES)) {
        $pdo->prepare('UPDATE orders SET status=? WHERE id=?')->execute([$to, $oid]);
        audit('order moved', '#' . $oid . ' -> ' . $to);
    }
    redirect('/dashboard/board' . (isset($_GET['all']) ? '?all=1' : ''));
}

$showDone = isset($_GET['all']);
$sql = 'SELECT o.*, c.name AS client_name FROM orders o JOIN clients c ON c.id = o.client_id WHERE ' . ($showDone ? '1=1' : "(o.status != 'completed' OR o.order_date >= date('now','-14 day'))") . ' ORDER BY CASE WHEN o.exam_date IS NULL OR o.exam_date = \'\' THEN 1 ELSE 0 END, o.exam_date, o.order_date DESC LIMIT 300';
$cols = array_fill_keys(array_keys(ORDER_STATUSES), []);
foreach ($pdo->query($sql) as $o) { $cols[$o['status']][] = $o; }
$today = date('Y-m-d');
$keys = array_keys(ORDER_STATUSES);

$pageTitle = 'Board';
$page = 'board';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="filters"><span class="muted">Orders by stage, nearest exam first.</span>
  <a class="btn ghost sm" style="margin-left:auto" href="/dashboard/board<?php echo $showDone ? '' : '?all=1'; ?>"><?php echo $showDone ? 'Hide old completed' : 'Show all completed'; ?></a></div>
<div class="board">
<?php foreach (ORDER_STATUSES as $k => $label): $i = array_search($k, $keys, true); ?>
  <section class="col">
    <h3><span class="badge b-<?php echo e($k); ?>"><?php echo e($label); ?></span> <span class="muted"><?php echo count($cols[$k]); ?></span></h3>
    <?php if (!$cols[$k]): ?><div class="muted" style="padding:8px">Nothing here.</div><?php endif; ?>
    <?php foreach ($cols[$k] as $o):
        $d = $o['exam_date'] ? (int)((strtotime($o['exam_date']) - strtotime($today)) / 86400) : null; ?>
      <article class="tile">
        <a href="/dashboard/orders?action=edit&amp;id=<?php echo (int)$o['id']; ?>"><strong><?php echo e($o['course_code'] ?: $o['file_type']); ?></strong></a>
        <div class="muted"><?php echo e($o['client_name']); ?></div>
        <div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap">
          <span class="badge b-<?php echo e($o['payment_status']); ?>"><?php echo e($o['payment_status']); ?></span>
          <?php if ($d !== null): ?><span class="badge <?php echo $d < 0 ? 'b-completed' : ($d <= 3 ? 'b-unpaid' : 'b-pending'); ?>"><?php echo $d < 0 ? 'exam passed' : ($d === 0 ? 'exam today' : 'exam in ' . $d . 'd'); ?></span><?php endif; ?>
        </div>
        <form method="post" action="/dashboard/board<?php echo $showDone ? '?all=1' : ''; ?>" class="mv">
          <?php echo csrf_field(); ?><input type="hidden" name="id" value="<?php echo (int)$o['id']; ?>">
          <?php if ($i > 0): ?><button name="to" value="<?php echo e($keys[$i - 1]); ?>" class="ghost sm" title="Move back">&larr;</button><?php endif; ?>
          <?php if ($i < count($keys) - 1): ?><button name="to" value="<?php echo e($keys[$i + 1]); ?>" class="sm">Move to <?php echo e(ORDER_STATUSES[$keys[$i + 1]]); ?> &rarr;</button><?php endif; ?>
        </form>
      </article>
    <?php endforeach; ?>
  </section>
<?php endforeach; ?>
</div>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
