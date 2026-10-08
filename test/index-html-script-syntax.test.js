'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

/** Every inline script block in index.html (no external src). */
function extractAllInlineScripts(source) {
  const scripts = [];
  let pos = 0;
  while (pos < source.length) {
    const open = source.indexOf('<script', pos);
    if (open < 0) break;
    const tagEnd = source.indexOf('>', open);
    if (tagEnd < 0) break;
    const openTag = source.slice(open, tagEnd + 1);
    if (/\ssrc\s*=/i.test(openTag)) {
      pos = tagEnd + 1;
      continue;
    }
    const close = source.indexOf('</script>', tagEnd);
    assert.ok(close > tagEnd, 'unclosed inline <script> in index.html');
    scripts.push(source.slice(tagEnd + 1, close));
    pos = close + '</script>'.length;
  }
  return scripts;
}

(function testAllInlineScriptsParse() {
  const scripts = extractAllInlineScripts(html);
  assert.ok(scripts.length >= 1, 'expected at least one inline script in index.html');
  const main = scripts.find((s) => s.includes('const MRJ_BUILD'));
  assert.ok(main, 'expected app bootstrap inline script');
  scripts.forEach((js, i) => {
    const tmp = path.join(os.tmpdir(), 'mrj-dec81-index-inline-' + i + '.js');
    fs.writeFileSync(tmp, js, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }
  });
})();

console.log('index-html-script-syntax: ok');
