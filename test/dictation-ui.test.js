'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const ASSET_V = 'dec20261022dict2';
assert.ok(html.includes(`const ASSET_V='${ASSET_V}'`), `ASSET_V must be ${ASSET_V}`);

assert.ok(!html.includes('says the sentence'), 'dictation caption must be removed');
assert.ok(html.includes('dict-face'), 'speaker face wrapper required');
assert.ok(html.includes('speaker-jaw'), 'mouth jaw clip required');
assert.ok(html.includes('function dictTalk'), 'dictTalk helper required');
assert.ok(html.includes('wireDictAudio'), 'dictation audio must drive talk animation');
assert.ok(html.includes('dictTalk(false)'), 'talk animation must stop when audio stops');

const mouthBlock = html.match(/const DICT_MOUTH=\{[\s\S]*?\};/);
assert.ok(mouthBlock, 'DICT_MOUTH map required');
const speakers = ['Harper', 'Coach', 'Grandma', 'Grandpa', 'Maya', 'Leo', 'Cowboy', 'Nia', 'Pirate', 'Car'];
for (const sp of speakers) {
  assert.ok(mouthBlock[0].includes(`${sp}:`), `mouth coords for ${sp}`);
}

const imgBlock = html.match(/const DICT_SPEAKER_IMG=\{[\s\S]*?\};/);
assert.ok(imgBlock, 'DICT_SPEAKER_IMG map required');
for (const sp of speakers) {
  assert.ok(imgBlock[0].includes(sp), `speaker image for ${sp}`);
}

const decodableDir = path.join(root, 'assets', 'decodable');
for (const file of fs.readdirSync(decodableDir)) {
  if (!file.endsWith('.png')) continue;
  const key = file.replace(/\.png$/i, '');
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  if (speakers.includes(label) || (label === 'Harper' && speakers.includes('Harper'))) {
    assert.ok(mouthBlock[0].includes(`${label}:`) || mouthBlock[0].includes('Harper:'), `coords for on-disk ${file}`);
  }
}

console.log('dictation-ui: ok');
