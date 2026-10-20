<?php
$page = $page ?? '';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?php echo htmlspecialchars($pageTitle ?? 'Dashboard'); ?> | Nibaha Haq</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root{--bg:#F4F8FD;--card:#fff;--border:#e2e8f0;--text:#1a202c;--muted:#64748b;--accent:#2563eb;--danger:#dc2626;--ok:#16a34a;}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
  a{color:var(--accent);text-decoration:none}
  .topbar{background:#111827;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  .topbar a{color:#cbd5e1;margin-right:16px;font-size:14px}
  .topbar a.active,.topbar a:hover{color:#fff}
  .topbar .brand{font-weight:700;color:#fff;margin-right:24px}
  .wrap{max-width:1000px;margin:0 auto;padding:24px 16px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
  .stat .num{font-size:28px;font-weight:700;color:var(--accent)}
  .stat .label{font-size:13px;color:var(--muted)}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase}
  tr:hover{background:#f8fafc}
  form{display:flex;flex-direction:column;gap:12px;max-width:480px}
  label{font-size:13px;font-weight:600;color:var(--muted)}
  input,select,textarea{padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;width:100%}
  textarea{resize:vertical;min-height:70px}
  button,.btn{background:var(--accent);color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:14px;cursor:pointer;display:inline-block}
  button:hover,.btn:hover{opacity:.9}
  .btn-sm{padding:5px 10px;font-size:12px}
  .btn-danger{background:var(--danger)}
  .btn-outline{background:#fff;color:var(--accent);border:1px solid var(--accent)}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
  .badge-paid{background:#dcfce7;color:var(--ok)}
  .badge-unpaid{background:#fee2e2;color:var(--danger)}
  .badge-pending{background:#fef3c7;color:#b45309}
  .badge-completed{background:#dbeafe;color:var(--accent)}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
  .search{max-width:260px}
  .msg{padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:14px}
  .msg-ok{background:#dcfce7;color:var(--ok)}
  .msg-err{background:#fee2e2;color:var(--danger)}
  .muted{color:var(--muted);font-size:13px}
</style>
</head>
<body>
<div class="topbar">
  <div style="display:flex;align-items:center;flex-wrap:wrap">
    <span class="brand">Nibaha Haq — Dashboard</span>
    <a href="/dashboard/index.php" class="<?php echo $page==='home'?'active':''; ?>">Home</a>
    <a href="/dashboard/clients.php" class="<?php echo $page==='clients'?'active':''; ?>">Clients</a>
    <a href="/dashboard/orders.php" class="<?php echo $page==='orders'?'active':''; ?>">Orders</a>
  </div>
  <div>
    <a href="/dashboard/change_password.php">Change Password</a>
    <a href="/dashboard/logout.php">Logout</a>
  </div>
</div>
<div class="wrap">
