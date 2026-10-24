<?php
require_once __DIR__ . '/includes/auth.php';
require_admin();
$pdo = get_db();
$type = ($_GET['type'] ?? '') === 'orders' ? 'orders' : 'clients';

// neutralise spreadsheet formula injection
function csv_cell($v) {
    $v = (string)$v;
    if ($v !== '' && strpos("=+-@\t\r", $v[0]) !== false) $v = "'" . $v;
    return $v;
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $type . '-' . date('Y-m-d') . '.csv"');
$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");
if ($type === 'orders') {
    fputcsv($out, ['Date', 'Client', 'File type', 'Files', 'Amount', 'Received', 'Payment', 'Status', 'Course', 'Exam date', 'Files sent', 'Notes']);
    foreach ($pdo->query('SELECT o.*, c.name cname FROM orders o JOIN clients c ON c.id=o.client_id ORDER BY o.order_date DESC') as $r) {
        fputcsv($out, array_map('csv_cell', [substr($r['order_date'], 0, 10), $r['cname'], $r['file_type'], $r['file_count'], $r['amount'], $r['paid_amount'], $r['payment_status'], $r['status'], $r['course_code'], $r['exam_date'], $r['files_note'], $r['notes']]));
    }
} else {
    fputcsv($out, ['Name', 'VU ID', 'WhatsApp', 'Course', 'Stage', 'Source', 'Next follow-up', 'Tags', 'Added', 'Notes']);
    foreach ($pdo->query('SELECT * FROM clients ORDER BY created_at DESC') as $r) {
        fputcsv($out, array_map('csv_cell', [$r['name'], $r['vu_id'], $r['whatsapp_number'], $r['course'], $r['stage'], $r['source'], $r['next_followup'], $r['tags'], substr($r['created_at'], 0, 10), $r['notes']]));
    }
}
fclose($out);
