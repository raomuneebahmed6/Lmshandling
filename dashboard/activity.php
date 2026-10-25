<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();

// inserts a row from an exported array; keeps the old id when free, otherwise lets SQLite pick a new one. Returns the id used.
function restore_row($pdo, $table, $row, $idMap = []) {
    foreach ($idMap as $col => $map) {
        if (isset($row[$col]) && isset($map[$row[$col]])) $row[$col] = $map[$row[$col]];
    }
    $old = $row['id'] ?? null;
    if ($old !== null) {
        $c = $pdo->prepare("SELECT COUNT(*) FROM $table WHERE id = ?");
        $c->execute([$old]);
        if ($c->fetchColumn()) unset($row['id']);
    }
    $cols = array_keys($row);
    $cols = array_values(array_filter($cols, fn($k) => preg_match('/^[a-z_]+$/', $k)));
    $vals = array_map(fn($k) => $row[$k], $cols);
    $pdo->prepare("INSERT INTO $table (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')')->execute($vals);
    return $old !== null && !isset($row['id']) ? (int)$pdo->lastInsertId() : (int)$old;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    $tid = (int)($_POST['id'] ?? 0);
    $s = $pdo->prepare('SELECT * FROM trash WHERE id = ?');
    $s->execute([$tid]);
    $t = $s->fetch(PDO::FETCH_ASSOC);
    if ($t && $do === 'restore') {
        $p = json_decode($t['payload'], true);
        try {
            $pdo->beginTransaction();
            if ($t['kind'] === 'bulk') {
                $n = 0;
                foreach ($p['clients'] as $b) {
                    $newCid = restore_row($pdo, 'clients', $b['client']);
                    $orderMap = [];
                    foreach ($b['orders'] as $o) { $oldId = $o['id']; $orderMap[$oldId] = restore_row($pdo, 'orders', $o, ['client_id' => [$b['client']['id'] => $newCid]]); }
                    foreach ($b['payments'] as $pay) restore_row($pdo, 'payments', $pay, ['order_id' => $orderMap]);
                    foreach ($b['activities'] as $a) restore_row($pdo, 'activities', $a, ['client_id' => [$b['client']['id'] => $newCid]]);
                    foreach (($b['chats'] ?? []) as $chat) restore_row($pdo, 'chats', $chat, ['client_id' => [$b['client']['id'] => $newCid]]);
                    $n++;
                }
                $msg = $n . ' clients restored from the clean-up batch.';
            } elseif ($t['kind'] === 'client') {
                $newCid = restore_row($pdo, 'clients', $p['client']);
                $orderMap = [];
                foreach ($p['orders'] as $o) {
                    $oldId = $o['id'];
                    $nid = restore_row($pdo, 'orders', $o, ['client_id' => [$p['client']['id'] => $newCid]]);
                    $orderMap[$oldId] = $nid;
                }
                foreach ($p['payments'] as $pay) restore_row($pdo, 'payments', $pay, ['order_id' => $orderMap]);
                foreach ($p['activities'] as $a) restore_row($pdo, 'activities', $a, ['client_id' => [$p['client']['id'] => $newCid]]);
                foreach (($p['chats'] ?? []) as $chat) restore_row($pdo, 'chats', $chat, ['client_id' => [$p['client']['id'] => $newCid]]);
                $msg = 'Client "' . $t['label'] . '" restored with its orders and history.';
            } else {
                $cl = $pdo->prepare('SELECT COUNT(*) FROM clients WHERE id = ?');
                $cl->execute([$p['order']['client_id']]);
                if (!$cl->fetchColumn()) throw new RuntimeException('The client of this order no longer exists. Restore the client first.');
                $nid = restore_row($pdo, 'orders', $p['order']);
                foreach ($p['payments'] as $pay) restore_row($pdo, 'payments', $pay, ['order_id' => [$p['order']['id'] => $nid]]);
                recalc_order($pdo, $nid);
                $msg = 'Order "' . $t['label'] . '" restored.';
            }
            $pdo->prepare('DELETE FROM trash WHERE id = ?')->execute([$tid]);
            $pdo->commit();
            audit('restored from trash', $t['kind'] . ': ' . $t['label']);
            flash($msg);
        } catch (Throwable $ex) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            flash('Could not restore: ' . $ex->getMessage(), 'err');
        }
    } elseif ($t && $do === 'purge') {
        $pdo->prepare('DELETE FROM trash WHERE id = ?')->execute([$tid]);
        audit('trash emptied item', $t['kind'] . ': ' . $t['label']);
        flash('Deleted for good.');
    }
    redirect('/dashboard/activity?tab=trash');
}

$tab = ($_GET['tab'] ?? 'log') === 'trash' ? 'trash' : 'log';
$log = $pdo->query('SELECT * FROM audit_log ORDER BY ts DESC, id DESC LIMIT 200')->fetchAll(PDO::FETCH_ASSOC);
$trash = $pdo->query('SELECT * FROM trash ORDER BY deleted_at DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Activity';
$page = 'activity';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="filters"><div class="tabs">
  <a class="<?php echo $tab === 'log' ? 'on' : ''; ?>" href="/dashboard/activity">Who did what</a>
  <a class="<?php echo $tab === 'trash' ? 'on' : ''; ?>" href="/dashboard/activity?tab=trash">Trash<b><?php echo count($trash); ?></b></a>
</div></div>
<?php if ($tab === 'log'): ?>
<section class="card">
  <?php if (!$log): ?><div class="empty">Nothing recorded yet.</div><?php else: ?>
  <div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
    <?php foreach ($log as $l): ?><tr><td><?php echo e(date('Y-m-d H:i', $l['ts'])); ?></td><td><?php echo e($l['username']); ?></td><td><strong><?php echo e($l['action']); ?></strong></td><td class="muted"><?php echo e($l['detail']); ?></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<?php else: ?>
<section class="card">
  <p class="muted" style="margin-top:0">Deleted clients and orders are kept here for 90 days so a mistake can be undone.</p>
  <?php if (!$trash): ?><div class="empty">Trash is empty.</div><?php else: ?>
  <div class="tablewrap"><table><thead><tr><th>Deleted</th><th>Type</th><th>Name</th><th>By</th><th></th></tr></thead><tbody>
    <?php foreach ($trash as $t): ?><tr><td><?php echo e(date('Y-m-d H:i', $t['deleted_at'])); ?></td><td><?php echo e($t['kind']); ?></td><td><strong><?php echo e($t['label']); ?></strong></td><td><?php echo e($t['deleted_by']); ?></td>
      <td style="display:flex;gap:6px"><form method="post" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="id" value="<?php echo (int)$t['id']; ?>"><button name="do" value="restore" class="gold sm">Restore</button></form>
        <form method="post" class="inline" data-confirm="Delete for good? This cannot be undone."><?php echo csrf_field(); ?><input type="hidden" name="id" value="<?php echo (int)$t['id']; ?>"><button name="do" value="purge" class="danger sm">Delete for good</button></form></td></tr><?php endforeach; ?>
  </tbody></table></div><?php endif; ?>
</section>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
