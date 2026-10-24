<?php
// Chat insights: simple keyword rules (no AI, nothing leaves the server).
// They give hints, not facts: always glance at the real chat.
require_once __DIR__ . '/chat.php';

function chat_detect_dmy($msgs) {
    foreach ($msgs as $m) {
        if (preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]/', $m['at'], $x)) {
            if ((int)$x[1] > 12) return true;
            if ((int)$x[2] > 12) return false;
        }
    }
    return true; // Pakistan: day first
}

function chat_ts($at, $dmy) {
    if (!preg_match('/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?(?:\s*([APap])\.?[Mm]\.?)?/', $at, $m)) return null;
    $day = $dmy ? (int)$m[1] : (int)$m[2];
    $mon = $dmy ? (int)$m[2] : (int)$m[1];
    $y = (int)$m[3]; if ($y < 100) $y += 2000;
    $h = (int)$m[4]; $ap = strtolower($m[6] ?? '');
    if ($ap === 'p' && $h < 12) $h += 12;
    if ($ap === 'a' && $h === 12) $h = 0;
    if (!checkdate($mon, $day, $y)) return null;
    return mktime($h, (int)$m[5], 0, $mon, $day, $y);
}

// who => 'client' | 'me'
function chat_sides($msgs, $title, $clientName = '') {
    $senders = [];
    foreach ($msgs as $m) $senders[$m['who']] = ($senders[$m['who']] ?? 0) + 1;
    $td = preg_replace('/\D/', '', (string)$title);
    $side = [];
    foreach ($senders as $who => $n) {
        $d = preg_replace('/\D/', '', $who);
        if (strcasecmp(trim($who), trim((string)$title)) === 0 || ($clientName !== '' && strcasecmp(trim($who), trim($clientName)) === 0)
            || ($td !== '' && $d !== '' && substr($d, -9) === substr($td, -9))) $side[$who] = 'client';
        elseif (preg_match('/nibaha|haq|^you$|^me$/i', $who)) $side[$who] = 'me';
    }
    $names = array_keys($senders);
    if (count($names) === 2) {
        [$a, $b] = $names;
        if (isset($side[$a]) && !isset($side[$b])) $side[$b] = $side[$a] === 'client' ? 'me' : 'client';
        elseif (isset($side[$b]) && !isset($side[$a])) $side[$a] = $side[$b] === 'client' ? 'me' : 'client';
        elseif (!isset($side[$a]) && !isset($side[$b])) { $side[$a] = 'client'; $side[$b] = 'me'; }
    }
    foreach ($names as $w) if (!isset($side[$w])) $side[$w] = 'client';
    return $side;
}

function chat_snip($s, $n = 90) {
    $s = trim(preg_replace('/\s+/', ' ', $s));
    return mb_strlen($s) > $n ? mb_substr($s, 0, $n - 1) . '...' : $s;
}

function chat_insights($msgs, $title, $clientName = '') {
    $dmy = chat_detect_dmy($msgs);
    $side = chat_sides($msgs, $title, $clientName);
    foreach ($msgs as &$m) { $m['ts'] = chat_ts($m['at'], $dmy); $m['side'] = $side[$m['who']] ?? 'client'; }
    unset($m);
    $n = count($msgs);
    $last = $msgs[$n - 1];
    $out = ['last_ts' => $last['ts'], 'last_from' => $last['side'], 'questions' => [], 'promises' => [], 'amounts' => [], 'payment' => null, 'needs' => [], 'urgent' => false];

    // everything the client said after your last reply
    $tail = [];
    for ($i = $n - 1; $i >= 0 && $msgs[$i]['side'] === 'client'; $i--) array_unshift($tail, $msgs[$i]);
    $qre = '/\?|\b(kya|kitn[aeiy]|kab|kahan|kaise|kaisy|kyun|konsa|kon sa|how|when|what|which|where|price|rate|fee|charges?)\b/iu';
    foreach ($tail as $m) if (!$m['media'] && preg_match($qre, $m['text'])) $out['questions'][] = chat_snip($m['text']);
    $out['questions'] = array_slice($out['questions'], -3);

    // things you said you would do
    $pre = '/\b(kal|tomorrow|shaam tak|raat tak|subah|aaj raat|bhej (deta|deti|dunga|dungi|doon|dun)|send (kar|kr) (deta|deti|dunga|dungi)|will send|i will|ill send|let me check|check kar|wait kar|thori der|baad me|later)\b/iu';
    $done = '/\b(bhej (di|diya|dia|di hain|diye)|send kar (di|diya)|sent|done|attached|check kar (lein|len|lo)|dekh (lein|len|lo)|mil gayi|mil gaya|delivered)\b/iu';
    $recent = array_slice($msgs, -60);
    foreach ($recent as $i => $m) {
        if ($m['side'] !== 'me' || $m['media'] || !preg_match($pre, $m['text'])) continue;
        $finished = false;
        for ($j = $i + 1; $j < count($recent); $j++) if ($recent[$j]['side'] === 'me' && !$recent[$j]['media'] && preg_match($done, $recent[$j]['text'])) { $finished = true; break; }
        if (!$finished) $out['promises'][] = ['at' => $m['at'], 'text' => chat_snip($m['text'])];
    }
    $out['promises'] = array_slice($out['promises'], -3);

    // money talk
    $amtre = '/(?:rs\.?|pkr|rupees?|rupay[ae]?)\s*([\d,]{3,7})\b|\b([\d,]{3,7})\s*(?:rs\.?|pkr|rupees?|rupay[ae]?|\/-)/iu';
    $payre = '/\b(payment|paid|pay|jazz ?cash|easy ?paisa|raast|iban|account|transfer(red)?|screenshot|receipt|advance|trx|transaction)\b/iu';
    for ($i = 0; $i < $n; $i++) {
        $m = $msgs[$i];
        if (!$m['media'] && preg_match_all($amtre, $m['text'], $mm, PREG_SET_ORDER)) {
            foreach ($mm as $x) {
                $raw = ($x[1] ?? '') !== '' ? $x[1] : ($x[2] ?? '');
                $v = (int)str_replace(',', '', $raw);
                if ($v >= 100 && $v <= 999999) $out['amounts'][] = ['v' => $v, 'by' => $m['side'], 'at' => $m['at']];
            }
        }
        if (!$m['media'] && preg_match($payre, $m['text'])) {
            $shot = false;
            for ($j = max(0, $i - 2); $j <= min($n - 1, $i + 3); $j++) if ($msgs[$j]['side'] === 'client' && $msgs[$j]['media']) { $shot = true; break; }
            $out['payment'] = ['at' => $m['at'], 'ts' => $m['ts'], 'by' => $m['side'], 'text' => chat_snip($m['text'], 70), 'screenshot' => $shot];
        } elseif ($m['media'] && $m['side'] === 'client' && $i > 0 && $out['payment'] && $msgs[$i - 1]['side'] === 'me' && preg_match($payre, $msgs[$i - 1]['text'])) {
            $out['payment']['screenshot'] = true;
        }
    }
    $out['amounts'] = array_slice($out['amounts'], -4);

    // what the client is asking for (client's own words only)
    $needs = ['Midterm' => '/\b(mid ?terms?|mids?)\b/iu', 'Finalterm' => '/\b(final ?terms?|finals?)\b/iu', 'Study files' => '/\b(files?|notes|mcqs?|past papers?|handouts?)\b/iu',
        'Course selection' => '/\bcourse selection\b/iu', 'Fee voucher' => '/\b(fee voucher|challan|voucher)\b/iu', 'Datesheet' => '/\bdate ?sheet\b/iu', 'Final Year Project' => '/\b(fyp|final year project)\b/iu'];
    $cl = [];
    foreach ($msgs as $m) if ($m['side'] === 'client' && !$m['media']) $cl[] = $m['text'];
    $blob = implode("\n", array_slice($cl, -80));
    foreach ($needs as $label => $re) if (preg_match($re, $blob)) $out['needs'][] = $label;
    $out['urgent'] = (bool)preg_match('/\b(urgent|jaldi|asap|abhi chahiye|aaj hi|emergency)\b/iu', implode("\n", array_slice($cl, -15)));
    return $out;
}

// short list of "what to do next", most important first
function chat_next_steps($ins, $now = null, $lastPaid = null) {
    $now = $now ?: time();
    $steps = [];
    if (($ins['last_from'] ?? '') === 'client' && !empty($ins['last_ts'])) {
        $days = (int)floor(($now - $ins['last_ts']) / 86400);
        $steps[] = $days >= 1 ? 'Reply to the client: waiting ' . $days . ' day' . ($days === 1 ? '' : 's') . '.' : 'The client wrote last. Reply today.';
    }
    if (!empty($ins['questions'])) $steps[] = 'Answer: "' . $ins['questions'][count($ins['questions']) - 1] . '"';
    // skip the payment hint when a payment was already recorded on or after the day it was mentioned
    $payNeeds = !empty($ins['payment']) && !($lastPaid && !empty($ins['payment']['ts']) && $lastPaid >= date('Y-m-d', (int)$ins['payment']['ts']));
    if ($payNeeds) $steps[] = !empty($ins['payment']['screenshot']) ? 'A payment screenshot looks sent (' . $ins['payment']['at'] . '). Check it and record the payment.' : 'Payment was mentioned (' . $ins['payment']['at'] . ') but no screenshot follows. Confirm it.';
    if (!empty($ins['promises'])) $steps[] = 'You said: "' . $ins['promises'][count($ins['promises']) - 1]['text'] . '". Make sure it is done.';
    return $steps;
}
