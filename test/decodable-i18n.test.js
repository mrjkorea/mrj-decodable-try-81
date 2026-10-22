'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const i18n = JSON.parse(fs.readFileSync(path.join(root, 'assets/decodable_i18n.json'), 'utf8'));
const lib = JSON.parse(fs.readFileSync(path.join(root, 'assets/decodable_library.json'), 'utf8'));
const langs = i18n.languages.map((l) => l.code);

const errors = [];
for (const book of lib.books) {
  const bid = book.id;
  const alignPath = path.join(root, 'assets', book.align);
  const align = JSON.parse(fs.readFileSync(alignPath, 'utf8'));
  const pageCount = align.pages.length;
  const expectedEn = align.pages.map((p) => p.text);
  const entry = i18n.books[bid];
  if (!entry) {
    errors.push(`${bid}: missing in decodable_i18n.json`);
    continue;
  }
  if (JSON.stringify(entry.en) !== JSON.stringify(expectedEn)) {
    errors.push(`${bid}: en[] does not match ${book.align} page texts`);
  }
  for (const lc of langs) {
    const lines = entry.l1 && entry.l1[lc];
    if (!lines) {
      errors.push(`${bid}: missing l1.${lc}`);
    } else if (lines.length !== pageCount) {
      errors.push(`${bid}: l1.${lc} has ${lines.length} lines, expected ${pageCount}`);
    } else if (lines.some((line) => typeof line !== 'string' || !String(line).trim())) {
      errors.push(`${bid}: l1.${lc} has an empty translation line`);
    }
  }
}

assert.strictEqual(errors.length, 0, errors.join('\n'));
console.log(`decodable-i18n: ok (${lib.books.length} books, ${langs.length} languages)`);
