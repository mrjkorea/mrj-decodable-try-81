'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gradeJs = fs.readFileSync(path.join(root, 'pronounce', 'grade-browser.js'), 'utf8');

(function testIndexUsesLocalCitrinetGrader() {
  assert.ok(html.includes('pronounce/grade-browser.js'), 'local grade-browser required');
  assert.ok(html.includes('pronounce/audio.js'), 'local audio helper required');
  assert.ok(!html.includes('mrj-decodable-try/pronounce/engine.js'), 'legacy engine.js must be removed');
  assert.ok(!html.includes('ort.all.min.js'), 'legacy ort.all bundle must be removed');
  assert.ok(!html.includes('needle'), 'Whistle/needle must not be referenced');
  assert.ok(!html.includes('SpeechRecognition'), 'browser SpeechRecognition must not be used');
})();

(function testGradeBrowserIsCitrinetOnly() {
  assert.ok(gradeJs.includes("mode: 'citrinet-only'"), 'forced citrinet-only boot');
  assert.ok(!gradeJs.includes('needle.js'), 'must not load Needle/Whistle');
  assert.ok(!gradeJs.includes('zipa'), 'must not load ZIPA');
  assert.ok(gradeJs.includes('PASS_AT = 60'), 'pass threshold 60');
})();

(async function main() {
  const trialUrl = pathToFileURL(path.join(root, 'pronounce', 'src', 'trial.js')).href;
  const trial = await import(trialUrl);
  assert.equal(trial.getTrialMode('?trial=citrinet-only'), 'citrinet-only');
  assert.deepEqual(trial.bootCitrinetOnlyPaths(), [
    'models/citrinet/model.int8.onnx',
    'models/citrinet/sp_pieces.json',
  ]);
  console.log('citrinet-only: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
