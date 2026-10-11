/**
 * Decodable pack merge helpers (browser + Node).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MRJDecodableProgress = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LEGACY_DEVICE_SAVE_KEY = "mrj_dec_progress_v4";

  function studentIdKeyFromName(name) {
    if (!name) return "";
    return String(name).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function studentSaveKey(idKey) {
    if (!idKey) return "";
    return LEGACY_DEVICE_SAVE_KEY + ":" + idKey;
  }

  function parseStoreJson(raw) {
    try {
      return JSON.parse(raw || "{}");
    } catch (e) {
      return {};
    }
  }

  /** Per-student localStorage only — never reads the shared device-wide legacy key. */
  function readStudentStore(getItem, idKey) {
    var key = studentSaveKey(idKey);
    if (!key) return {};
    var raw = getItem(key);
    if (raw == null || raw === "") return {};
    return parseStoreJson(raw);
  }

  function booksForStudent(store, studentName) {
    if (!store || !studentName) return {};
    return (store.byStudent && store.byStudent[studentName]) || {};
  }

  function buildProgressBlob(studentName, store) {
    return JSON.stringify({ v: 1, books: booksForStudent(store, studentName) });
  }

  function progressBlobFromStorage(getItem, idKey, studentName) {
    return buildProgressBlob(studentName, readStudentStore(getItem, idKey));
  }

  function blankProg() {
    return {
      passed: false,
      listen: false,
      song: false,
      read: false,
      dictation: false,
      speak: false,
      readPages: {},
      difficulty: null,
      dictScore: null,
      speakPages: {},
    };
  }

  function mergeFlagMaps(a, b) {
    var out = Object.assign({}, a || {}, b || {});
    var keys = new Set(
      Object.keys(a || {}).concat(Object.keys(b || {}))
    );
    keys.forEach(function (k) {
      out[k] = !!((a && a[k]) || (b && b[k]));
    });
    return out;
  }

  function mergeScoreMaps(a, b) {
    var out = Object.assign({}, a || {}, b || {});
    var keys = new Set(
      Object.keys(a || {}).concat(Object.keys(b || {}))
    );
    keys.forEach(function (k) {
      var va = a && a[k] != null ? +a[k] : NaN;
      var vb = b && b[k] != null ? +b[k] : NaN;
      if (isFinite(va) && isFinite(vb)) out[k] = Math.max(va, vb);
      else if (isFinite(va)) out[k] = va;
      else if (isFinite(vb)) out[k] = vb;
    });
    return out;
  }

  function unionSpeakFails(a, b) {
    if (a == null) return b == null ? undefined : b;
    if (b == null) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
      var seen = new Set();
      var out = [];
      a.concat(b).forEach(function (item) {
        var key = JSON.stringify(item);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(item);
      });
      return out;
    }
    if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      return mergeFlagMaps(a, b);
    }
    return a;
  }

  function mergeBookProgress(local, remote) {
    local = Object.assign(blankProg(), local || {});
    remote = Object.assign(blankProg(), remote || {});
    var merged = {
      passed: !!(local.passed || remote.passed),
      listen: !!(local.listen || remote.listen),
      song: !!(local.song || remote.song),
      read: !!(local.read || remote.read),
      dictation: !!(local.dictation || remote.dictation),
      speak: !!(local.speak || remote.speak),
      readPages: mergeFlagMaps(local.readPages, remote.readPages),
      speakPages: mergeScoreMaps(local.speakPages, remote.speakPages),
      difficulty: local.difficulty != null ? local.difficulty : remote.difficulty,
      dictScore: null,
    };
    var ld = local.dictScore != null ? +local.dictScore : NaN;
    var rd = remote.dictScore != null ? +remote.dictScore : NaN;
    if (isFinite(ld) && isFinite(rd)) merged.dictScore = Math.max(ld, rd);
    else if (isFinite(ld)) merged.dictScore = ld;
    else if (isFinite(rd)) merged.dictScore = rd;

    if (local.reported || remote.reported) {
      merged.reported = mergeFlagMaps(local.reported, remote.reported);
    }
    var sf = unionSpeakFails(local.speakFails, remote.speakFails);
    if (sf !== undefined) merged.speakFails = sf;

    var lr = local.rev != null ? +local.rev : NaN;
    var rr = remote.rev != null ? +remote.rev : NaN;
    if (isFinite(lr) || isFinite(rr)) {
      merged.rev = Math.max(isFinite(lr) ? lr : 0, isFinite(rr) ? rr : 0);
    }
    return merged;
  }

  function mergeDecodableBooks(localBooks, serverBooks) {
    localBooks = localBooks || {};
    serverBooks = serverBooks || {};
    var out = {};
    var ids = new Set(
      Object.keys(localBooks).concat(Object.keys(serverBooks))
    );
    ids.forEach(function (id) {
      out[id] = mergeBookProgress(localBooks[id], serverBooks[id]);
    });
    return out;
  }

  function parseProgressJson(raw) {
    try {
      var data = JSON.parse(raw || "{}");
      if (!data || typeof data !== "object") return { books: {}, parseOk: false };
      if (!data.books || typeof data.books !== "object") {
        return { books: {}, parseOk: true };
      }
      return { books: data.books, parseOk: true };
    } catch (e) {
      return { books: {}, parseOk: false };
    }
  }

  function needsSaveAfterMerge(mergedBooks, serverBooks) {
    var serverNorm = mergeDecodableBooks(serverBooks || {}, {});
    return JSON.stringify(mergedBooks || {}) !== JSON.stringify(serverNorm);
  }

  /** Whether library UI may open (assets loaded + signed-in student). */
  function createLibraryBootCoordinator() {
    var assetsReady = false;
    var signedIn = false;
    var opened = false;
    return {
      markAssetsReady: function () {
        assetsReady = true;
        return this.consumeOpen();
      },
      onAuthReady: function (hasStudent) {
        signedIn = !!hasStudent;
        if (!signedIn) {
          opened = false;
          return false;
        }
        return this.consumeOpen();
      },
      onSignOut: function () {
        signedIn = false;
        opened = false;
        return false;
      },
      consumeOpen: function () {
        if (!signedIn || !assetsReady || opened) return false;
        opened = true;
        return true;
      },
      shouldShowLibrary: function () {
        return signedIn && assetsReady;
      },
    };
  }

  /** Metrics item_id for decodable section scores (book-prefixed). */
  function decodableScoreItemId(bookId, section) {
    bookId = String(bookId == null ? "" : bookId).trim();
    section = String(section == null ? "" : section).trim();
    if (!bookId || !section) return section || bookId || "";
    var prefix = bookId + ":";
    if (section.indexOf(prefix) === 0) return section;
    return prefix + section;
  }

  function localDate(when) {
    var d = when ? new Date(when) : new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function scorePctFromRaw(raw, max) {
    var maxN = +max;
    if (!isFinite(maxN) || maxN <= 0) return 0;
    return Math.round(100 * (+raw) / maxN);
  }

  function speakPageSection(pageIndex) {
    var n = +pageIndex;
    if (!isFinite(n) || n < 0) n = 0;
    return "speak-p" + String(n + 1).padStart(2, "0");
  }

  function speakAggregateScores(speakPages, pageCount) {
    var sp = speakPages || {};
    var sum = 0;
    Object.keys(sp).forEach(function (k) {
      var n = +sp[k];
      if (isFinite(n)) sum += n;
    });
    var pages = pageCount != null ? +pageCount : Object.keys(sp).length;
    if (!isFinite(pages) || pages <= 0) pages = Object.keys(sp).length || 0;
    return { raw: Math.round(sum), max: 100 * pages };
  }

  /**
   * ClassroomMetrics event + optional SSI noteScore payload for decodable reporting.
   */
  function buildDecodableScoreReport(opts) {
    opts = opts || {};
    var student = String(opts.student == null ? "" : opts.student).trim();
    if (!student) return null;
    var bookId = String(opts.bookId == null ? "" : opts.bookId).trim();
    var section = String(opts.section == null ? "" : opts.section).trim();
    if (!bookId || !section) return null;
    var when = opts.when != null ? opts.when : Date.now();
    var ld = localDate(when);
    var key = studentIdKeyFromName(student);
    var itemId = decodableScoreItemId(bookId, section);
    var skipNote = !!opts.skipNoteScore;
    var itemType = opts.itemType || "section";
    var completed = opts.completed !== false;
    var includeScores = !opts.omitScores;
    var rawN = +opts.raw;
    var maxN = +opts.max;
    if (includeScores && (!isFinite(maxN) || maxN <= 0)) return null;
    var scorePct = includeScores ? scorePctFromRaw(rawN, maxN) : null;
    var meta = Object.assign(
      { student: student, section: section, book_id: bookId },
      opts.metadata || {}
    );
    var event = {
      event_id: "dec-" + itemId + "-" + when.toString(36),
      event_kind: "decodable_progress",
      source: "decodable",
      app_name: "MRJ Decodables",
      curriculum_program: opts.program || "decodable",
      book_title: bookId,
      item_id: itemId,
      item_type: itemType,
      completed: completed,
      identity_method: "mrj_signin",
      identity_confidence: "high",
      local_date: ld,
      metadata_json: JSON.stringify(meta),
    };
    if (includeScores) {
      event.score_value = rawN;
      event.score_max = maxN;
      event.score_pct = scorePct;
    }
    var sessionPrefix = opts.sessionPrefix || "decodable";
    var body = {
      student_email: student.indexOf("@") > 0 ? student : key,
      student_name: student,
      session_id: sessionPrefix + "-" + key + "-" + ld,
      events: [event],
    };
    var noteScore = null;
    if (!skipNote && includeScores) {
      noteScore = {
        program: opts.program || "decodable",
        itemId: itemId,
        scoreValue: rawN,
        scoreMax: maxN,
        scorePct: scorePct,
        localDate: ld,
      };
    }
    return { body: body, noteScore: noteScore, itemId: itemId, localDate: ld };
  }

  return {
    LEGACY_DEVICE_SAVE_KEY: LEGACY_DEVICE_SAVE_KEY,
    studentIdKeyFromName: studentIdKeyFromName,
    studentSaveKey: studentSaveKey,
    readStudentStore: readStudentStore,
    booksForStudent: booksForStudent,
    buildProgressBlob: buildProgressBlob,
    progressBlobFromStorage: progressBlobFromStorage,
    blankProg: blankProg,
    mergeBookProgress: mergeBookProgress,
    mergeDecodableBooks: mergeDecodableBooks,
    parseProgressJson: parseProgressJson,
    needsSaveAfterMerge: needsSaveAfterMerge,
    createLibraryBootCoordinator: createLibraryBootCoordinator,
    decodableScoreItemId: decodableScoreItemId,
    localDate: localDate,
    scorePctFromRaw: scorePctFromRaw,
    speakPageSection: speakPageSection,
    speakAggregateScores: speakAggregateScores,
    buildDecodableScoreReport: buildDecodableScoreReport,
  };
});
