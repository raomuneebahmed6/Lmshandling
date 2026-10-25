<?php
// WhatsApp "Export chat" helpers (Android .txt, iPhone .txt inside a .zip).

const CHAT_MAX_BYTES = 5 * 1024 * 1024;

function chat_normalise($text) {
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    // invisible marks WhatsApp adds (LRM/RLM, narrow no-break space)
    $text = str_replace(["\u{200E}", "\u{200F}", "\u{202F}", "\u{00A0}"], ['', '', ' ', ' '], $text);
    return preg_replace("/\r\n|\r/", "\n", $text);
}

// Splits an exported chat into messages: [ ['at'=>, 'who'=>, 'text'=>, 'media'=>bool], ... ] (system lines are dropped)
function chat_parse($text) {
    $text = chat_normalise($text);
    $msgs = [];
    $cur = null;
    $dt = '(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?[Mm]\.?)?)';
    $android = '/^' . $dt . '\s+-\s+(.*)$/u';
    $ios = '/^\[' . $dt . '\]\s+(.*)$/u';
    // text copied straight from WhatsApp Web: "[7:57 AM, 10/24/2026] Name: message"
    $web = '/^\[(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?[Mm]\.?)?),\s*(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\]\s+(.*)$/u';
    foreach (explode("\n", $text) as $line) {
        $m = null; $ok = false;
        if (preg_match($web, $line, $w)) { $m = [$line, $w[2], $w[1], $w[3]]; $ok = true; } // normalise to date, time, rest
        elseif (preg_match($android, $line, $m) || preg_match($ios, $line, $m)) { $ok = true; }
        if ($ok) {
            if ($cur) $msgs[] = $cur;
            $rest = $m[3];
            $cur = null;
            if (preg_match('/^([^:]{1,80}?):\s(.*)$/su', $rest, $p)) {
                $cur = ['at' => $m[1] . ' ' . $m[2], 'who' => trim($p[1]), 'text' => $p[2]];
            } else {
                $cur = null; // system message such as "Messages are end-to-end encrypted"
            }
        } elseif ($cur !== null && $line !== '') {
            $cur['text'] .= "\n" . $line; // continuation of a multi-line message
        }
    }
    if ($cur) $msgs[] = $cur;
    foreach ($msgs as &$x) {
        $x['media'] = (bool)preg_match('/^(<Media omitted>|\(file attached\)|image omitted|video omitted|audio omitted|sticker omitted|document omitted|<attached:)/i', trim($x['text']));
    }
    return $msgs;
}

// Hides anything that looks like a login password before a chat is stored. Returns [clean text, number of places hidden].
function chat_redact($text) {
    $n = 0;
    // "password: xyz", "pass - xyz", "pss xyz"
    $text = preg_replace_callback('/\b(password|passcode|passwd|pass|pwd|pss)\b(\s*[:=\-\x{2013}\x{2014}]*\s*)(\S+)/iu', function ($m) use (&$n) { $n++; return $m[1] . $m[2] . '[hidden]'; }, $text);
    // a line that holds a VU login ID plus another password-like token
    $lines = explode("\n", $text);
    foreach ($lines as &$line) {
        if (!preg_match('/\b(?:bc|zs|mc|ms)\d{9,10}\b/i', $line)) continue;
        $line = preg_replace_callback('/(?<![\w@.\/])(?=[^\s]*[A-Za-z])(?=[^\s]*\d)(?=[^\s]*[^\w\s])[^\s]{8,28}(?![\w])/u', function ($m) use (&$n) {
            if (preg_match('/https?:|www\.|\.com|\.pk|\.edu/i', $m[0])) return $m[0];
            $n++; return '[hidden]';
        }, $line);
    }
    unset($line);
    return [implode("\n", $lines), $n];
}

// "WhatsApp Chat with Ali Khan.txt" / "WhatsApp Chat - Ali Khan.zip" / "Chat with +92 300 1234567.txt" -> "Ali Khan"
function chat_title_from_filename($name) {
    $n = preg_replace('/\.(txt|zip)$/i', '', basename($name));
    $n = preg_replace('/^(whatsapp\s*chat\s*(with|-|–)\s*|chat\s*with\s*)/i', '', $n);
    $n = preg_replace('/\s*\(\d+\)$/', '', $n); // "(1)" copies
    return trim($n);
}

function chat_phone_from_title($title) {
    $d = preg_replace('/\D/', '', $title);
    return (strlen($d) >= 10 && preg_match('/^[+\d][\d\s\-()+]+$/', $title)) ? $title : '';
}

// course codes mentioned in the chat (e.g. STA301, CS201), most mentioned first
function chat_courses($text) {
    if (!preg_match_all('/\b([A-Za-z]{2,4})\s?-?(\d{3})\b/', $text, $m, PREG_SET_ORDER)) return [];
    $known = ['CS', 'MGT', 'ECO', 'STA', 'ENG', 'ISL', 'PAK', 'PSY', 'MCM', 'MTH', 'BIO', 'BT', 'PHY', 'CHE', 'EDU', 'SOC', 'URD', 'ACC', 'FIN', 'MKT', 'HRM', 'BNK', 'COM', 'GSC', 'HIS', 'SWE', 'IT', 'MIS', 'LAW', 'ZOO', 'STA', 'VU'];
    $cnt = [];
    foreach ($m as $x) {
        $pre = strtoupper($x[1]);
        if (!in_array($pre, $known, true) || $pre === 'VU') continue;
        $code = $pre . $x[2];
        $cnt[$code] = ($cnt[$code] ?? 0) + 1;
    }
    arsort($cnt);
    return array_slice(array_keys($cnt), 0, 6);
}

// returns [ ['name'=>file name, 'text'=>chat text], ... ] for an uploaded .txt or .zip; or ['error'=>...]
function chat_texts_from_upload($tmp, $name) {
    if (preg_match('/\.zip$/i', $name)) {
        if (!class_exists('ZipArchive')) return ['error' => 'This server cannot open .zip files. Export the chat "Without media" to get a .txt file.'];
        $z = new ZipArchive();
        if ($z->open($tmp) !== true) return ['error' => 'Could not open the zip file.'];
        $out = [];
        for ($i = 0; $i < $z->numFiles && count($out) < 5; $i++) {
            $st = $z->statIndex($i);
            if (!preg_match('/\.txt$/i', $st['name']) || $st['size'] > CHAT_MAX_BYTES || strpos($st['name'], '..') !== false) continue;
            $out[] = ['name' => $name . ' / ' . basename($st['name']), 'text' => (string)$z->getFromIndex($i)];
        }
        $z->close();
        return $out ?: ['error' => 'No chat text file found inside the zip.'];
    }
    $text = (string)file_get_contents($tmp, false, null, 0, CHAT_MAX_BYTES + 1);
    if (strlen($text) > CHAT_MAX_BYTES) return ['error' => 'File is bigger than 5 MB.'];
    return [['name' => $name, 'text' => $text]];
}
