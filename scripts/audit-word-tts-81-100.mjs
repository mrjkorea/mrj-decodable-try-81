#!/usr/bin/env node
/**
 * Audit word-click TTS for books 81–100:
 * - lemmas from align JSON (same tokenization as index.html readUnits)
 * - vs assets/books/<id>/audio/words/<lemma>.mp3
 * - optional match to assets/word_tts_canon_b41-60.json (books 41–60 voice cache)
 *
 * Usage: node scripts/audit-word-tts-81-100.mjs [--md docs/WORD_TTS_AUDIT_81-100.md]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const CANON_PATH = path.join(ASSETS, 'word_tts_canon_b41-60.json');

function readUnits(text) {
  const units = [];
  const re = /[A-Za-z']+|[^A-Za-z']+/g;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (/[A-Za-z']/.test(tok)) units.push({ kind: 'word', show: tok, lemma: tok.toLowerCase() });
  }
  return units;
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function durationSec(file) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${JSON.stringify(file)}`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

function singularize(w) {
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) return w.slice(0, -1);
  return w;
}

const SHORT_SEC = 0.15;
const canon = fs.existsSync(CANON_PATH)
  ? JSON.parse(fs.readFileSync(CANON_PATH, 'utf8')).lemmas || {}
  : {};

const books = [];
for (let n = 81; n <= 100; n++) {
  const id = `mlr_dec_${String(n).padStart(3, '0')}`;
  const alignPath = path.join(ASSETS, `align_${id}.json`);
  if (!fs.existsSync(alignPath)) {
    books.push({ id, error: 'missing align' });
    continue;
  }
  const align = JSON.parse(fs.readFileSync(alignPath, 'utf8'));
  const lemmas = new Set();
  for (const p of align.pages || []) {
    for (const u of readUnits(p.text)) lemmas.add(u.lemma);
  }
  const wordsDir = path.join(ASSETS, 'books', id, 'audio', 'words');
  const mp3s = fs.existsSync(wordsDir)
    ? fs.readdirSync(wordsDir).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\.mp3$/, ''))
    : [];
  const have = new Set(mp3s);
  const missing = [...lemmas].filter((l) => !have.has(l)).sort();
  const extra = [...have].filter((l) => !lemmas.has(l)).sort();

  const pluralFixable = [];
  for (const m of missing) {
    const sing = singularize(m);
    if (sing !== m && have.has(sing)) pluralFixable.push({ need: m, have: sing });
    else if (have.has(m + 's')) pluralFixable.push({ need: m, have: m + 's', note: 'inverse' });
  }

  const fileMeta = {};
  for (const w of mp3s) {
    const fp = path.join(wordsDir, w + '.mp3');
    fileMeta[w] = { md5: md5(fp), dur: durationSec(fp), size: fs.statSync(fp).size };
  }
  const byHash = new Map();
  for (const [w, meta] of Object.entries(fileMeta)) {
    if (!byHash.has(meta.md5)) byHash.set(meta.md5, []);
    byHash.get(meta.md5).push(w);
  }
  const dupHashes = [...byHash.entries()].filter(([, ws]) => ws.length > 1);

  const durs = mp3s.map((w) => fileMeta[w].dur).filter((d) => d > 0);
  durs.sort((a, b) => a - b);
  const median = durs.length ? durs[Math.floor(durs.length / 2)] : 0;

  const short = [];
  const suspicious = [];
  const canonMismatch = [];
  for (const l of lemmas) {
    if (!have.has(l)) continue;
    const meta = fileMeta[l];
    if (meta.dur > 0 && meta.dur < SHORT_SEC) short.push({ word: l, dur: meta.dur });
    if (meta.dur > 0 && median > 0 && meta.dur < median * 0.35 && meta.dur < 0.25) {
      suspicious.push({ word: l, dur: meta.dur, median });
    }
    const ref = canon[l];
    if (ref && ref !== meta.md5) canonMismatch.push({ word: l, md5: meta.md5.slice(0, 8), ref: ref.slice(0, 8) });
  }

  const fixes = [];
  if (canonMismatch.length) fixes.push(`canon: ${canonMismatch.map((x) => x.word).join(', ')}`);
  if (missing.length) fixes.push(`missing: ${missing.join(', ')}`);
  if (pluralFixable.length) fixes.push(`plural: ${pluralFixable.map((x) => x.need).join(', ')}`);
  if (dupHashes.length) fixes.push(`dup-hash: ${dupHashes.map(([, ws]) => ws.join('=')).join('; ')}`);

  books.push({
    id,
    title: align.title,
    lemmaCount: lemmas.size,
    mp3Count: mp3s.length,
    missing,
    extra,
    pluralFixable,
    dupHashes: dupHashes.map(([h, ws]) => ({ md5: h.slice(0, 8), words: ws })),
    short,
    suspicious,
    canonMismatch,
    status: fixes.length ? fixes.join(' · ') : 'ok',
  });
}

const mdFlag = process.argv.includes('--md');
const mdPath = process.argv[process.argv.indexOf('--md') + 1] || path.join(ROOT, 'docs', 'WORD_TTS_AUDIT_81-100.md');

if (mdFlag) {
  const lines = [
    '# Word-click TTS audit — books 81–100',
    '',
    'Read-mode taps call `playWord(lemma)` → `assets/books/<book_id>/audio/words/<lemma>.mp3` (lemma = lowercased on-page token; see `readUnits` / `data-lem` in `index.html`).',
    '',
    'Checks: missing/extra mp3, plural filename gaps, duplicate hashes within a book, clips under 150ms, and (when present) MD5 match to `assets/word_tts_canon_b41-60.json` (Clear American Male cache shared with books 41–60).',
    '',
    '| Book | Lemmas | MP3 | Status | Notes |',
    '|------|--------|-----|--------|-------|',
  ];
  for (const b of books) {
    const notes = [];
    if (b.missing?.length) notes.push(`missing: ${b.missing.join(', ')}`);
    if (b.pluralFixable?.length) notes.push(`plural fixable: ${JSON.stringify(b.pluralFixable)}`);
    if (b.dupHashes?.length) notes.push(`dup: ${JSON.stringify(b.dupHashes)}`);
    if (b.short?.length) notes.push(`short: ${JSON.stringify(b.short)}`);
    if (b.canonMismatch?.length) notes.push(`canon≠: ${b.canonMismatch.map((x) => x.word).join(', ')}`);
    lines.push(
      `| ${b.id.replace('mlr_dec_', '')} | ${b.lemmaCount ?? '—'} | ${b.mp3Count ?? '—'} | ${b.status ?? b.error} | ${notes.join('; ') || '—'} |`
    );
  }
  lines.push('', 'Generated by `node scripts/audit-word-tts-81-100.mjs --md`.', '');
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, lines.join('\n'));
  console.error('Wrote', mdPath);
}

console.log(JSON.stringify(books, null, 2));
