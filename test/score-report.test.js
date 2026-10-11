'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M = require('../decodable-progress.js');

const TEST_STUDENT = 'zz_test_mrjmetrics';
const BOOK = 'mlr_dec_045';
const FIXED_WHEN = Date.parse('2026-10-11T15:30:00');

function createReporter(mocks) {
  const posts = [];
  const notes = [];
  const reportingStudent = mocks.reportingStudent;
  const PROGRAM = 'decodable';
  const SCORE_URL = 'https://example.test/score';

  function reportScore(bookId, section, raw, max, extra) {
    const student = reportingStudent();
    if (!student || !bookId || !section) return;
    extra = extra || {};
    const rawN = +raw;
    const maxN = +max;
    const isCompletion = maxN === 1 && rawN === 1 && !extra.itemType;
    const built = M.buildDecodableScoreReport({
      student,
      bookId,
      section: String(section),
      raw: rawN,
      max: maxN,
      when: mocks.when != null ? mocks.when : Date.now(),
      program: PROGRAM,
      itemType: extra.itemType || (isCompletion ? 'completion' : 'section'),
      completed: extra.completed !== false,
      skipNoteScore: !!extra.skipNoteScore,
      omitScores: !!extra.omitScores,
      metadata: extra.metadata,
    });
    if (!built) return;
    posts.push({ url: SCORE_URL, body: built.body });
    if (built.noteScore && mocks.noteScore) mocks.noteScore(built.noteScore);
    notes.push(built.noteScore);
  }

  function reportSpeakAggregate(bookId, speakPages, pageCount) {
    const agg = M.speakAggregateScores(speakPages, pageCount);
    if (!agg.max) return;
    reportScore(bookId, 'speak', agg.raw, agg.max, { metadata: { pages: pageCount } });
  }

  function speakPageSectionId(pageIndex) {
    return M.speakPageSection(pageIndex);
  }

  return { reportScore, reportSpeakAggregate, speakPageSectionId, posts, notes };
}

(function testDictationRawScores() {
  const mocks = {
    when: FIXED_WHEN,
    reportingStudent: () => TEST_STUDENT,
    noteScore: (payload) => {
      mocks.lastNote = payload;
    },
    lastNote: null,
  };
  const r = createReporter(mocks);
  r.reportScore(BOOK, 'dictation', 4, 5, {
    completed: true,
    metadata: { misses: 1 },
  });
  assert.strictEqual(r.posts.length, 1);
  const ev = r.posts[0].body.events[0];
  assert.strictEqual(ev.item_id, 'mlr_dec_045:dictation');
  assert.strictEqual(ev.score_value, 4);
  assert.strictEqual(ev.score_max, 5);
  assert.strictEqual(ev.score_pct, 80);
  assert.strictEqual(ev.local_date, '2026-10-11');
  assert.strictEqual(r.posts[0].body.student_email, TEST_STUDENT);
  assert.strictEqual(mocks.lastNote.itemId, 'mlr_dec_045:dictation');
  assert.strictEqual(mocks.lastNote.scoreValue, 4);
  assert.strictEqual(mocks.lastNote.scoreMax, 5);
  assert.strictEqual(mocks.lastNote.scorePct, 80);
  assert.strictEqual(mocks.lastNote.localDate, '2026-10-11');
})();

(function testTenPageSpeakNoteScores() {
  const mocks = {
    when: FIXED_WHEN,
    reportingStudent: () => TEST_STUDENT,
    noteScore: () => {},
  };
  const r = createReporter(mocks);
  const speakPages = {};
  for (let i = 0; i < 10; i++) {
    const score = 70 + i;
    speakPages[i] = score;
    r.reportScore(BOOK, r.speakPageSectionId(i), score, 100);
  }
  const noteScores = r.notes.filter(Boolean);
  assert.strictEqual(noteScores.length, 10);
  assert.strictEqual(noteScores[0].itemId, 'mlr_dec_045:speak-p01');
  assert.strictEqual(noteScores[9].itemId, 'mlr_dec_045:speak-p10');
  r.reportSpeakAggregate(BOOK, speakPages, 10);
  const speakNote = r.notes[r.notes.length - 1];
  assert.strictEqual(speakNote.itemId, 'mlr_dec_045:speak');
  assert.strictEqual(speakNote.scoreMax, 1000);
  const expectedRaw = Object.keys(speakPages).reduce((s, k) => s + speakPages[k], 0);
  assert.strictEqual(speakNote.scoreValue, expectedRaw);
})();

(function testNoReportWhenOnlyLocalStorageStudent() {
  const store = { 'mrj-dec-student': 'stale_name' };
  const mocks = {
    reportingStudent: () => {
      try {
        if (global.MRJ_AUTH && MRJ_AUTH.student()) return String(MRJ_AUTH.student()).trim();
      } catch (e) {}
      return '';
    },
    noteScore: () => {
      mocks.noteCalled = true;
    },
    noteCalled: false,
  };
  global.MRJ_AUTH = { student: () => '' };
  const r = createReporter(mocks);
  r.reportScore(BOOK, 'listen', 1, 1);
  assert.strictEqual(r.posts.length, 0);
  assert.strictEqual(mocks.noteCalled, false);
  delete global.MRJ_AUTH;
})();

(function testSpeakAttemptSkipsNoteScore() {
  const mocks = {
    when: FIXED_WHEN,
    reportingStudent: () => TEST_STUDENT,
    noteScore: () => {
      mocks.noteCalled = true;
    },
    noteCalled: false,
  };
  const r = createReporter(mocks);
  r.reportScore(BOOK, 'speak-p03', 42, 100, {
    skipNoteScore: true,
    itemType: 'attempt',
    completed: false,
  });
  assert.strictEqual(r.posts.length, 1);
  assert.strictEqual(r.posts[0].body.events[0].item_type, 'attempt');
  assert.strictEqual(mocks.noteCalled, false);
  assert.strictEqual(r.notes.filter(Boolean).length, 0);
})();

console.log('score-report: ok');
