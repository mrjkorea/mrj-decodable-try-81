'use strict';
// Letter-intro videos: align letter_intros, the LETTER_INTRO fallback in index.html and the folder README
// must list the same files, and any mp4 dropped into the folder must be a real MP4 from that list.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const lib = JSON.parse(fs.readFileSync(path.join(root, 'assets/decodable_library.json'), 'utf8'));
const dir = path.join(root, 'assets/decodable/letter_intro');
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');

const block = html.match(/const LETTER_INTRO=(\{[\s\S]*?\});/);
assert.ok(block, 'LETTER_INTRO fallback map required in index.html');
const fallback = Function('return ' + block[1])();

const ids = lib.books.map((b) => b.id);
assert.deepStrictEqual(Object.keys(fallback).sort(), ids.slice().sort(), 'LETTER_INTRO must cover exactly the library books');
assert.ok(html.includes("'decodable/letter_intro/'"), 'clips must load from assets/decodable/letter_intro/ via asset()');

for (const book of lib.books) {
  const align = JSON.parse(fs.readFileSync(path.join(root, 'assets', book.align), 'utf8'));
  const names = align.letter_intros;
  assert.ok(Array.isArray(names) && names.length > 0, `${book.id}: letter_intros missing in ${book.align}`);
  assert.deepStrictEqual(names, fallback[book.id], `${book.id}: ${book.align} letter_intros must match LETTER_INTRO`);
  for (const name of names) {
    assert.match(name, /^[a-z0-9_]+_letter_intro\.mp4$/, `${book.id}: unexpected file name ${name}`);
    assert.ok(readme.includes('`' + name + '`'), `${book.id}: README must list ${name}`);
  }
}

const listed = new Set(Object.values(fallback).flat());
const present = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp4'));
for (const file of present) {
  assert.ok(listed.has(file), `unexpected mp4 in assets/decodable/letter_intro: ${file}`);
  const head = Buffer.alloc(8);
  const fd = fs.openSync(path.join(dir, file), 'r');
  try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
  assert.strictEqual(head.toString('latin1', 4, 8), 'ftyp', `${file} is not a real MP4 (no ftyp box)`);
}

console.log(`letter-intro: ok (${ids.length} books, ${present.length}/${listed.size} mp4s present)`);
