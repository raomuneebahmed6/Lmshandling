<?php
$page = $page ?? '';
$user = current_user();
$flash = take_flash();
$nav = [
    'home' => ['/dashboard/index.php', 'Home', '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
    'clients' => ['/dashboard/clients.php', 'Clients', '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-5-5.7"/>'],
    'orders' => ['/dashboard/orders.php', 'Orders', '<path d="M6 2l-3 4v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'],
    'followups' => ['/dashboard/followups.php', 'Follow-ups', '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>'],
    'settings' => ['/dashboard/change_password.php', 'Password', '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
];
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?php echo e($pageTitle ?? 'Dashboard'); ?> | Nibaha Haq</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/favicon-32x32.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="/dashboard/assets/dash.css?v=2">
<script src="/dashboard/assets/dash.js?v=1" defer></script>
</head>
<body class="app">
<aside class="side" id="side" aria-label="Main navigation">
  <a class="brand" href="/dashboard/index.php">
    <img src="/assets/logo.webp" alt="" width="40" height="40">
    <span><strong>Nibaha Haq</strong><small>Client CRM</small></span>
  </a>
  <nav>
    <?php foreach ($nav as $key => $n): ?>
      <a href="<?php echo $n[0]; ?>" class="<?php echo $page === $key ? 'on' : ''; ?>"<?php echo $page === $key ? ' aria-current="page"' : ''; ?>>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><?php echo $n[2]; ?></svg>
        <?php echo $n[1]; ?>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="side-foot">
    <a href="/" target="_blank" rel="noopener">View website</a>
    <form method="post" action="/dashboard/logout.php"><?php echo csrf_field(); ?><button type="submit" class="linkbtn">Log out (<?php echo e($user['username'] ?? ''); ?>)</button></form>
  </div>
</aside>
<div class="scrim" id="scrim"></div>
<div class="main">
  <header class="top">
    <button class="burger" id="burger" type="button" aria-label="Open menu" aria-controls="side" aria-expanded="false"><span></span><span></span><span></span></button>
    <h1><?php echo e($pageTitle ?? 'Dashboard'); ?></h1>
    <div class="top-actions">
      <a class="btn ghost sm" href="/dashboard/clients.php?action=new">+ Client</a>
      <a class="btn sm" href="/dashboard/orders.php?action=new">+ Order</a>
    </div>
  </header>
  <main class="wrap">
  <?php if ($flash): ?><div class="msg msg-<?php echo e($flash['t']); ?>" role="status"><?php echo e($flash['m']); ?></div><?php endif; ?>
