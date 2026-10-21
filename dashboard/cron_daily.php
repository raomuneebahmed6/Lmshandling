<?php
// Run from a Hostinger cron job (command line only), once a day:
//   php /home/USER/domains/lmshandling.com/public_html/dashboard/cron_daily.php
if (php_sapi_name() !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/includes/db.php';
$pdo = get_db();
$g = function ($k) use ($pdo) { $s = $pdo->prepare('SELECT v FROM settings WHERE k = ?'); $s->execute([$k]); return $s->fetchColumn(); };
$email = (string)$g('summary_email');
if ($g('summary_on') !== '1' || $email === '') {
    echo "Summary is off or no email set.\n";
    exit;
}
$today = date('Y-m-d');
$q = function ($sql, $p = []) use ($pdo) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchAll(PDO::FETCH_ASSOC); };

$over = $q("SELECT name, next_followup FROM clients WHERE next_followup IS NOT NULL AND next_followup != '' AND next_followup < ? AND stage IN ('lead','active') ORDER BY next_followup", [$today]);
$due = $q("SELECT name FROM clients WHERE next_followup = ? AND stage IN ('lead','active')", [$today]);
$exams = $q("SELECT o.exam_date, o.course_code, c.name FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.exam_date >= ? AND o.exam_date <= ? AND o.status != 'completed' ORDER BY o.exam_date", [$today, date('Y-m-d', strtotime('+7 days'))]);
$owed = $q("SELECT c.name, SUM(MAX(COALESCE(o.amount,0)-COALESCE(o.paid_amount,0),0)) s FROM orders o JOIN clients c ON c.id=o.client_id GROUP BY c.id HAVING s > 0 ORDER BY s DESC LIMIT 10");
$totalOwed = array_sum(array_column($owed, 's'));

$lines = ["Good morning. Your Nibaha Haq CRM summary for $today", ''];
$lines[] = 'FOLLOW-UPS TODAY (' . count($due) . ')';
foreach ($due as $r) $lines[] = ' - ' . $r['name'];
$lines[] = '';
$lines[] = 'OVERDUE FOLLOW-UPS (' . count($over) . ')';
foreach (array_slice($over, 0, 15) as $r) $lines[] = ' - ' . $r['name'] . ' (since ' . $r['next_followup'] . ')';
$lines[] = '';
$lines[] = 'EXAMS IN THE NEXT 7 DAYS (' . count($exams) . ')';
foreach ($exams as $r) $lines[] = ' - ' . $r['exam_date'] . ': ' . $r['name'] . ($r['course_code'] ? ' (' . $r['course_code'] . ')' : '');
$lines[] = '';
$lines[] = 'STILL TO COLLECT: Rs. ' . number_format($totalOwed);
foreach ($owed as $r) $lines[] = ' - ' . $r['name'] . ': Rs. ' . number_format($r['s']);
$lines[] = '';
$lines[] = 'Open the dashboard: https://lmshandling.com/dashboard/';

$ok = @mail($email, 'CRM summary ' . $today, implode("\n", $lines), "From: Nibaha Haq CRM <no-reply@lmshandling.com>\r\nContent-Type: text/plain; charset=UTF-8");
echo $ok ? "Summary sent to $email\n" : "mail() failed\n";
