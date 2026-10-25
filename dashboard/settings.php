<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    settings_set('require_2fa', !empty($_POST['require_2fa']) ? '1' : '0');
    audit('settings saved', 'require_2fa=' . (!empty($_POST['require_2fa']) ? 'on' : 'off'));
    $email = trim($_POST['summary_email'] ?? '');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        flash('That email address does not look right.', 'err');
    } else {
        settings_set('summary_email', $email);
        settings_set('summary_on', !empty($_POST['summary_on']) && $email !== '' ? '1' : '0');
        flash('Settings saved.');
    }
    redirect('/dashboard/settings');
}

$email = settings_get('summary_email');
$on = settings_get('summary_on') === '1';
$pageTitle = 'Settings';
$page = 'settings2';
include __DIR__ . '/includes/layout_top.php';
?>
<section class="card" style="max-width:680px">
  <div class="card-head"><h2>Daily summary email</h2><span class="badge b-<?php echo $on ? 'paid' : 'unpaid'; ?>"><?php echo $on ? 'ON' : 'OFF'; ?></span></div>
  <p class="muted" style="margin-top:0">Every morning the dashboard can email you: follow-ups due today, overdue ones, upcoming exams and money still to collect. It runs from a Hostinger cron job (see below).</p>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?>
    <div><label for="se">Send the summary to</label><input id="se" type="email" name="summary_email" value="<?php echo e($email); ?>" placeholder="you@example.com"></div>
    <div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="summary_on" value="1" style="width:auto"<?php echo $on ? ' checked' : ''; ?>> Send it every morning</label></div>
    <div><button type="submit" class="gold">Save</button></div>
  </form>
</section>
<section class="card" style="max-width:680px">
  <div class="card-head"><h2>Security</h2></div>
  <form method="post" class="stack">
    <?php echo csrf_field(); ?>
    <input type="hidden" name="summary_email" value="<?php echo e($email); ?>"><?php if ($on): ?><input type="hidden" name="summary_on" value="1"><?php endif; ?>
    <div><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="require_2fa" value="1" style="width:auto"<?php echo two_factor_required() ? ' checked' : ''; ?>> Require two-step login for every account (recommended)</label></div>
    <p class="muted" style="margin:0">When this is on, nobody can use the dashboard until they have set up the authenticator app.</p>
    <div><button type="submit" class="ghost">Save</button></div>
  </form>
</section>
<section class="card" style="max-width:680px">
  <div class="card-head"><h2>Cron jobs to add in Hostinger (hPanel &rarr; Advanced &rarr; Cron Jobs)</h2></div>
  <p class="muted" style="margin-top:0">Use the same folder path Hostinger shows for your site. Typical commands:</p>
  <pre class="codes">php /home/USERNAME/domains/lmshandling.com/public_html/dashboard/cron_daily.php
php /home/USERNAME/domains/lmshandling.com/public_html/dashboard/cron_backup.php</pre>
  <p class="muted" style="margin-bottom:0">Set both to run once a day (for example 7:00 for the summary, 2:00 for the backup). Email delivery depends on the hosting mail service; if it does not arrive, check spam first.</p>
</section>
<?php include __DIR__ . '/includes/layout_bottom.php'; ?>
