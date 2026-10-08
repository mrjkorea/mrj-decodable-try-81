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
  };
});
