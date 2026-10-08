'use strict';

const assert = require('assert');
const M = require('../decodable-progress.js');

(function testMergeBoolsAndScores() {
  const a = { passed: false, listen: true, dictScore: 70, readPages: { '0': true } };
  const b = { passed: true, song: true, dictScore: 85, readPages: { '1': true } };
  const m = M.mergeBookProgress(a, b);
  assert.strictEqual(m.passed, true);
  assert.strictEqual(m.listen, true);
  assert.strictEqual(m.song, true);
  assert.strictEqual(m.dictScore, 85);
  assert.strictEqual(m.readPages['0'], true);
  assert.strictEqual(m.readPages['1'], true);
})();

(function testSpeakPagesMax() {
  const m = M.mergeBookProgress({ speakPages: { '0': 60, '1': 90 } }, { speakPages: { '0': 80 } });
  assert.strictEqual(m.speakPages['0'], 80);
  assert.strictEqual(m.speakPages['1'], 90);
})();

(function testUnparseablePack() {
  const p = M.parseProgressJson('{not json');
  assert.strictEqual(p.parseOk, false);
  assert.deepStrictEqual(p.books, {});
})();

(function testNeverReadsSharedLegacyKey() {
  const aliceOnly = JSON.stringify({
    byStudent: { alice: { mlr_dec_083: { listen: true } } }
  });
  const store = {
    [M.LEGACY_DEVICE_SAVE_KEY]: JSON.stringify({
      byStudent: {
        alice: { mlr_dec_081: { passed: true } },
        bob: { mlr_dec_082: { passed: true } }
      }
    }),
    [M.studentSaveKey('alice')]: aliceOnly
  };
  const keysRead = [];
  const data = M.readStudentStore(function (key) {
    keysRead.push(key);
    return store[key];
  }, 'alice');
  assert.strictEqual(keysRead.length, 1);
  assert.strictEqual(keysRead[0], M.studentSaveKey('alice'));
  assert.ok(!keysRead.includes(M.LEGACY_DEVICE_SAVE_KEY));
  const books = M.booksForStudent(data, 'alice');
  assert.deepStrictEqual(books.mlr_dec_083, { listen: true });
  assert.strictEqual(books.mlr_dec_081, undefined);
})();

(function testDecodableScoreItemId() {
  assert.strictEqual(M.decodableScoreItemId('mlr_dec_081', 'listen'), 'mlr_dec_081:listen');
  assert.strictEqual(M.decodableScoreItemId('mlr_dec_100', 'passed'), 'mlr_dec_100:passed');
  assert.strictEqual(M.decodableScoreItemId('mlr_dec_081', 'mlr_dec_081:dictation'), 'mlr_dec_081:dictation');
})();

(function testReloadSavedSessionOpensLibraryOnce() {
  const c = M.createLibraryBootCoordinator();
  assert.strictEqual(c.onAuthReady(true), false, 'auth-ready before assets must not open yet');
  assert.strictEqual(c.markAssetsReady(), true, 'assets ready after saved session should open');
  assert.strictEqual(c.markAssetsReady(), false, 'second mark must not reopen');
  assert.strictEqual(c.onAuthReady(true), false, 'duplicate auth-ready must not reopen');
})();

(function testAuthReadyAfterAssets() {
  const c = M.createLibraryBootCoordinator();
  assert.strictEqual(c.markAssetsReady(), false, 'no student yet');
  assert.strictEqual(c.onAuthReady(true), true, 'sign-in after load should open');
  assert.strictEqual(c.onAuthReady(true), false, 'only once');
})();

(function testNeedsSaveAfterMerge() {
  const server = { mlr_dec_081: { listen: true } };
  const local = { mlr_dec_081: { read: true } };
  const merged = M.mergeDecodableBooks(local, server);
  assert.strictEqual(M.needsSaveAfterMerge(merged, server), true);
})();

console.log('decodable-progress: ok');
