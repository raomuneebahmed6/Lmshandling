<?php
// Run from a Hostinger cron job (command line only), e.g. daily:
//   php /home/USER/public_html/dashboard/cron_backup.php
if (php_sapi_name() !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/includes/backup.php';
echo 'Backup created: ' . make_backup() . PHP_EOL;
