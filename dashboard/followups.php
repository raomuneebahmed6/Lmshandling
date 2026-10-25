<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();
$today = date('Y-m-d');

$s = $pdo->query("SELECT id, name, whatsapp_number, course, stage, next_followup FROM clients WHERE next_followup IS NOT NULL AND next_followup!='' AND stage IN ('lead','active') ORDER BY next_followup");
$all = $s->fetchAll(PDO::FETCH_ASSOC);
$groups = ['Overdue' => [], 'Today' => [], 'Upcoming' => []];
foreach ($all as $c) {
    if ($c['next_followup'] < $today) $groups['Overdue'][] = $c;
    elseif ($c['next_followup'] === $today) $groups['Today'][] = $c;
    else $groups['Upcoming'][] = $c;
}

// unpaid orders older than 3 days (payment reminders)
$unpaid = $pdo->query("SELECT o.id, o.amount, o.paid_amount, o.order_date, o.file_type, c.id cid, c.name, c.whatsapp_number FROM orders o JOIN clients c ON c.id=o.client_id WHERE MAX(COALESCE(o.amount,0)-COALESCE(o.paid_amount,0),0) > 0 OR (o.amount IS NULL AND o.payment_status!='paid') ORDER BY o.order_date LIMIT 30")->fetchAll(PDO::FETCH_ASSOC);

// clients whose newest saved chat ends with a message from the client (they are waiting for you)
$waiting = $pdo->prepare("SELECT ch.id AS chat_id, ch.last_ts, ch.insights, ch.imported_at, c.id AS cid, c.name, c.whatsapp_number FROM chats ch JOIN clients c ON c.id = ch.client_id
    WHERE ch.id = (SELECT c2.id FROM chats c2 WHERE c2.client_id = ch.client_id ORDER BY c2.imported_at DESC, c2.id DESC LIMIT 1)
    AND ch.last_from = 'client' AND ch.last_ts IS NOT NULL AND ch.last_ts <= ? AND c.stage IN ('lead','active') ORDER BY ch.last_ts LIMIT 30");
$waiting->execute([time() - 86400]);
$waitList = $waiting->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Follow-ups';
$page = 'followups';
include __DIR__ . '/includes/layout_top.php';
?>
<?php if (!$all): ?>
  <div class="card empty">No follow-ups scheduled. Open a client and set "Next follow-up" to get reminders here.</div>
<?php endif; ?>
<?php foreach ($groups as $label => $rows): if (!$rows) continue; ?>
<section class="card">
  <div class="card-head"><h2><?php echo e($label); ?> <span class="badge <?php echo $label === 'Overdue' ? 'b-unpaid' : ($label === 'Today' ? 'b-pending' : 'b-partial'); ?>"><?php echo count($rows); ?></span></h2></div>
  <div class="tablewrap"><table>
    <thead><tr><th>Date</th><th>Client</th><th>Course</th><th>Stage</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($rows as $c): $wa = wa_number($c['whatsapp_number']); ?>
      <tr>
        <td class="<?php echo $label === 'Overdue' ? 'due-over' : ($label === 'Today' ? 'due-today' : ''); ?>"><?php echo e($c['next_followup']); ?></td>
        <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$c['id']; ?>"><strong><?php echo e($c['name']); ?></strong></a></td>
        <td><?php echo e($c['course'] ?: '-'); ?></td>
        <td><span class="badge b-<?php echo e($c['stage']); ?>"><?php echo e(STAGES[$c['stage']] ?? $c['stage']); ?></span></td>
        <td style="display:flex;gap:6px">
          <?php if ($wa): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode('Assalam o Alaikum ' . $c['name'] . ', this is Nibaha Haq from lmshandling.com. '); ?>">WhatsApp</a><?php endif; ?>
          <form method="post" action="/dashboard/clients" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="snooze"><input type="hidden" name="id" value="<?php echo (int)$c['id']; ?>"><input type="hidden" name="back" value="followups"><button name="days" value="1" class="ghost sm" title="Move to tomorrow">+1d</button><button name="days" value="3" class="ghost sm">+3d</button><button name="days" value="7" class="ghost sm">+7d</button></form>
          <form method="post" action="/dashboard/clients" class="inline"><?php echo csrf_field(); ?><input type="hidden" name="do" value="done"><input type="hidden" name="id" value="<?php echo (int)$c['id']; ?>"><input type="hidden" name="back" value="followups"><button type="submit" class="ghost sm">Done</button></form>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
</section>
<?php endforeach; ?>

<?php if ($waitList): ?>
<section class="card">
  <div class="card-head"><h2>Waiting for your reply <span class="badge b-unpaid"><?php echo count($waitList); ?></span></h2><span class="muted">from the newest saved chat of each client</span></div>
  <div class="tablewrap"><table>
    <thead><tr><th>Client</th><th>Last message</th><th>Waiting</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($waitList as $w): $d = (int)floor((time() - (int)$w['last_ts']) / 86400); $wi = json_decode((string)$w['insights'], true) ?: []; $wa = wa_number($w['whatsapp_number']); ?>
      <tr>
        <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$w['cid']; ?>"><strong><?php echo e($w['name']); ?></strong></a><?php echo !empty($wi['urgent']) ? ' <span class="badge b-unpaid">urgent</span>' : ''; ?></td>
        <td class="muted"><?php echo e(date('Y-m-d H:i', (int)$w['last_ts'])); ?><?php echo !empty($wi['questions']) ? '<br>' . e(end($wi['questions'])) : ''; ?></td>
        <td class="<?php echo $d >= 3 ? 'due-over' : 'due-today'; ?>"><?php echo $d; ?> day<?php echo $d === 1 ? '' : 's'; ?></td>
        <td style="display:flex;gap:6px"><a class="btn ghost sm" href="/dashboard/chat?id=<?php echo (int)$w['chat_id']; ?>">Open chat</a><?php if ($wa): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>">WhatsApp</a><?php endif; ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <p class="muted" style="margin-bottom:0">Based on the date of the saved export. Save a newer chat export to refresh it.</p>
</section>
<?php endif; ?>

<section class="card">
  <div class="card-head"><h2>Payments to collect <span class="badge b-unpaid"><?php echo count($unpaid); ?></span></h2><a class="btn ghost sm" href="/dashboard/orders?payment=due">Open in Orders</a></div>
  <?php if (!$unpaid): ?><div class="empty">All orders are paid.</div><?php else: ?>
  <div class="tablewrap"><table>
    <thead><tr><th>Order date</th><th>Client</th><th>Type</th><th class="num">Owes</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($unpaid as $o): $wa = wa_number($o['whatsapp_number']); ?>
      <tr>
        <td><?php echo e(substr($o['order_date'], 0, 10)); ?></td>
        <td><a href="/dashboard/clients?action=view&amp;id=<?php echo (int)$o['cid']; ?>"><?php echo e($o['name']); ?></a></td>
        <td><?php echo e($o['file_type']); ?></td>
        <td class="num"><?php echo $o['amount'] !== null ? e(number_format(owed($o))) : '-'; ?></td>
        <td><?php if ($wa): ?><a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/<?php echo e($wa); ?>?text=<?php echo rawurlencode('Assalam o Alaikum ' . $o['name'] . ', a friendly reminder about the pending payment' . ($o['amount'] !== null ? ' of Rs. ' . number_format(owed($o)) : '') . ' for your ' . $o['file_type'] . ' order. JazakAllah.'); ?>">Remind</a><?php endif; ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table></div>
  <?php endif; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
