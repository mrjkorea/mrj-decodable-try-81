'use strict';
// Word-click TTS: lemmas vs audio/words/*.mp3 for books 81–100 (+ shared 41–60 canon hashes).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(
  html,
  /function playWord\(lem, onend\)\{\s*playPath\('books\/'\+pack\.book_id\+'\/audio\/words\/'\+encodeURIComponent\(lem\)\+'\.mp3'/,
  'playWord must encode lemma in word mp3 path'
);
assert.match(html, /lemma:tok\.toLowerCase\(\)/, 'readUnits lowercases lemma for taps');

function readUnits(text) {
  const units = [];
  const re = /[A-Za-z']+|[^A-Za-z']+/g;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (/[A-Za-z']/.test(tok)) units.push(tok.toLowerCase());
  }
  return units;
}

function md5File(fp) {
  return crypto.createHash('md5').update(fs.readFileSync(fp)).digest('hex');
}

const canon = JSON.parse(
  fs.readFileSync(path.join(root, 'assets/word_tts_canon_b41-60.json'), 'utf8')
).lemmas;

const byLemma = new Map();
const issues = [];

for (let n = 81; n <= 100; n++) {
  const id = `mlr_dec_${String(n).padStart(3, '0')}`;
  const align = JSON.parse(fs.readFileSync(path.join(root, 'assets', `align_${id}.json`), 'utf8'));
  const lemmas = [...new Set(align.pages.flatMap((p) => readUnits(p.text)))];
  const wordsDir = path.join(root, 'assets/books', id, 'audio/words');
  const hashes = new Map();
  for (const lem of lemmas) {
    const fp = path.join(wordsDir, `${lem}.mp3`);
    if (!fs.existsSync(fp)) {
      issues.push(`${id}: missing ${lem}.mp3`);
      continue;
    }
    const h = md5File(fp);
    if (!hashes.has(h)) hashes.set(h, []);
    hashes.get(h).push(lem);
    if (!byLemma.has(lem)) byLemma.set(lem, new Set());
    byLemma.get(lem).add(h);
    const ref = canon[lem];
    if (ref && ref !== h) issues.push(`${id}: ${lem}.mp3 canon mismatch (got ${h.slice(0, 8)}, want ${ref.slice(0, 8)})`);
  }
  for (const [h, ws] of hashes) {
    if (ws.length > 1) issues.push(`${id}: duplicate hash for ${ws.join(', ')}`);
  }
}

for (const [lem, set] of byLemma) {
  if (set.size > 1) issues.push(`cross-book: ${lem} has ${set.size} different mp3 hashes in band 81–100`);
}

assert.deepStrictEqual(issues, [], issues.join('\n'));
console.log('word-tts-81-100: ok');
