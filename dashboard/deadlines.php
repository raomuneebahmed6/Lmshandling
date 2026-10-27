<?php
// Deadlines: exam, quiz, GDB, assignment or fee dates that YOU enter (copy them from VU's official
// notices). Nothing here is guessed or pulled from anywhere automatically.
require_once __DIR__ . '/includes/auth.php';
require_login();
$pdo = get_db();

const DEADLINE_KINDS = ['mids' => 'Mid-term', 'finals' => 'Final exam', 'quiz' => 'Quiz', 'gdb' => 'GDB', 'assignment' => 'Assignment', 'fee' => 'Fee / admission', 'other' => 'Other'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = $_POST['do'] ?? '';
    if ($do === 'add') {
        $date = (string)($_POST['due_date'] ?? '');
        $title = mb_substr(trim((string)($_POST['title'] ?? '')), 0, 120);
        $kind = array_key_exists($_POST['kind'] ?? '', DEADLINE_KINDS) ? $_POST['kind'] : 'other';
        if (!valid_date($date) || $title === '') {
            flash('Give a title and a valid date.', 'err');
        } else {
            $pdo->prepare('INSERT INTO deadlines (due_date, kind, title, course, note, created_by, created_at) VALUES (?,?,?,?,?,?,?)')
                ->execute([$date, $kind, $title, strtoupper(mb_substr(preg_replace('/[^A-Za-z0-9 \/-]/', '', trim((string)($_POST['course'] ?? ''))), 0, 40)), mb_substr(trim((string)($_POST['note'] ?? '')), 0, 300), current_user()['username'] ?? '', time()]);
            audit('deadline added', $title . ' ' . $date);
            flash('Deadline added.');
        }
    } elseif ($do === 'delete') {
        $pdo->prepare('DELETE FROM deadlines WHERE id = ?')->execute([(int)($_POST['id'] ?? 0)]);
        audit('deadline removed', '#' . (int)($_POST['id'] ?? 0));
        flash('Deadline removed.');
    }
    redirect('/dashboard/deadlines');
}

$today = date('Y-m-d');
$upcoming = $pdo->prepare('SELECT * FROM deadlines WHERE due_date >= ? ORDER BY due_date, id');
$upcoming->execute([$today]);
$upcoming = $upcoming->fetchAll(PDO::FETCH_ASSOC);
$past = $pdo->prepare('SELECT * FROM deadlines WHERE due_date < ? ORDER BY due_date DESC LIMIT 20');
$past->execute([$today]);
$past = $past->fetchAll(PDO::FETCH_ASSOC);

$pageTitle = 'Deadlines';
$page = 'deadlines';
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card">
  <div class="card-head"><h2>Add a deadline</h2></div>
  <p class="muted" style="margin-top:0">Copy the date from VU's official notice or datesheet. Upcoming ones show on the Home page.</p>
  <form method="post" class="stack" style="max-width:680px">
    <?php echo csrf_field(); ?><input type="hidden" name="do" value="add">
    <div class="row2">
      <div><label for="dt">Title</label><input id="dt" name="title" required maxlength="120" placeholder="e.g. CS101 mid-term paper"></div>
      <div><label for="dd">Date</label><input id="dd" type="date" name="due_date" required></div>
    </div>
    <div class="row2">
      <div><label for="dk">Type</label><select id="dk" name="kind"><?php foreach (DEADLINE_KINDS as $k => $v): ?><option value="<?php echo e($k); ?>"><?php echo e($v); ?></option><?php endforeach; ?></select></div>
      <div><label for="dc">Course code (optional)</label><input id="dc" name="course" maxlength="12" placeholder="CS101"></div>
    </div>
    <div><label for="dn">Note (optional)</label><input id="dn" name="note" maxlength="300"></div>
    <div><button type="submit" class="gold">Add</button></div>
  </form>
</section>

<section class="card">
  <div class="card-head"><h2>Upcoming <span class="badge b-pending"><?php echo count($upcoming); ?></span></h2></div>
  <?php if (!$upcoming): ?><div class="empty">No upcoming deadlines.</div><?php else: ?>
  <ul class="list"><?php foreach ($upcoming as $d): $left = (int)((strtotime($d['due_date']) - strtotime($today)) / 86400); ?>
    <li><span><strong><?php echo e($d['title']); ?></strong><?php echo $d['course'] ? ' &middot; ' . e($d['course']) : ''; ?><br>
      <span class="muted"><?php echo e($d['due_date']); ?> &middot; <?php echo e(DEADLINE_KINDS[$d['kind']] ?? $d['kind']); ?><?php echo $d['note'] ? ' &middot; ' . e($d['note']) : ''; ?></span></span>
      <span style="display:flex;gap:8px;align-items:center"><span class="badge <?php echo $left <= 2 ? 'b-unpaid' : 'b-pending'; ?>"><?php echo $left === 0 ? 'today' : ($left === 1 ? 'tomorrow' : $left . ' days'); ?></span>
      <form method="post" class="inline" data-confirm="Remove this deadline?"><?php echo csrf_field(); ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?php echo (int)$d['id']; ?>"><button class="danger sm" type="submit">Remove</button></form></span></li>
  <?php endforeach; ?></ul>
  <?php endif; ?>
</section>

<?php if ($past): ?>
<section class="card">
  <div class="card-head"><h2>Recently passed</h2></div>
  <ul class="list"><?php foreach ($past as $d): ?><li><span><?php echo e($d['title']); ?><?php echo $d['course'] ? ' &middot; ' . e($d['course']) : ''; ?></span><span class="muted"><?php echo e($d['due_date']); ?></span></li><?php endforeach; ?></ul>
</section>
<?php endif; ?>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
