<?php
require_once __DIR__ . '/includes/auth.php';
require_login();
require_once __DIR__ . '/includes/chat.php';
$pdo = get_db();

$s = $pdo->prepare('SELECT ch.*, c.name AS client_name FROM chats ch JOIN clients c ON c.id = ch.client_id WHERE ch.id = ?');
$s->execute([(int)($_GET['id'] ?? $_POST['id'] ?? 0)]);
$ch = $s->fetch(PDO::FETCH_ASSOC);
if (!$ch) { http_response_code(404); exit('Chat not found.'); }

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (!is_admin()) { http_response_code(403); exit('Only the admin can delete a saved chat.'); }
    $pdo->prepare('DELETE FROM chats WHERE id = ?')->execute([$ch['id']]);
    audit('chat deleted', $ch['client_name'] . ' (#' . $ch['client_id'] . ')');
    flash('Chat deleted.');
    redirect('/dashboard/clients.php?action=view&id=' . $ch['client_id']);
}

$msgs = chat_parse($ch['body']);
// the "other person" is the sender whose name matches the chat title (or phone digits); everyone else is "you"
$titleDigits = preg_replace('/\D/', '', (string)$ch['title']);
$isOther = function ($who) use ($ch, $titleDigits) {
    if (strcasecmp(trim($who), trim((string)$ch['title'])) === 0) return true;
    $d = preg_replace('/\D/', '', $who);
    return $titleDigits !== '' && $d !== '' && substr($d, -9) === substr($titleDigits, -9);
};

$pageTitle = 'Chat with ' . $ch['client_name'];
$page = 'clients';
include __DIR__ . '/includes/layout_top.php';
?>
<div class="filters">
  <a class="btn ghost sm" href="/dashboard/clients.php?action=view&amp;id=<?php echo (int)$ch['client_id']; ?>">&larr; <?php echo e($ch['client_name']); ?></a>
  <input type="search" data-chat-filter placeholder="Search inside this chat..." aria-label="Search inside this chat" style="max-width:300px">
  <span class="muted" id="chatcount"><?php echo count($msgs); ?> messages &middot; <?php echo e($ch['first_at']); ?> &ndash; <?php echo e($ch['last_at']); ?></span>
  <?php if (is_admin()): ?><form method="post" class="inline" style="margin-left:auto" data-confirm="Delete this saved chat? This cannot be undone."><?php echo csrf_field(); ?><input type="hidden" name="id" value="<?php echo (int)$ch['id']; ?>"><button class="danger sm" type="submit">Delete chat</button></form><?php endif; ?>
</div>
<section class="card chatbox">
  <?php $lastDay = ''; foreach ($msgs as $m): $other = $isOther($m['who']); $day = explode(' ', $m['at'])[0]; ?>
    <?php if ($day !== $lastDay): $lastDay = $day; ?><div class="chatday"><?php echo e($day); ?></div><?php endif; ?>
    <div class="msg2 <?php echo $other ? 'them' : 'me'; ?>" data-text="<?php echo e(mb_strtolower($m['who'] . ' ' . $m['text'])); ?>">
      <div class="who"><?php echo e($other ? $m['who'] : 'You (' . $m['who'] . ')'); ?> <span><?php echo e(substr(strstr($m['at'], ' '), 1)); ?></span></div>
      <div class="txt"><?php echo $m['media'] ? '<em>media / attachment</em>' : nl2br(e($m['text'])); ?></div>
    </div>
  <?php endforeach; ?>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
