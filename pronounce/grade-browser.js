/* MRJ Decodable — shared MRJ HuBERT phoneme checker.
 * Loads https://mrjkorea.github.io/pronounce/src/shared.js (model: pronounce/models/hubert/manifest.json,
 * ron-jo/hubert-base-phoneme-en-onnx int8) so the model is cached once per browser for all MRJ apps.
 * Colours: green 75+, yellow 50-74, red under 50. PASS = line average >= 60.
 */
(function (global) {
  const SHARED_URL = 'https://mrjkorea.github.io/pronounce/src/shared.js';
  const APP_ID = 'decodables';
  const THRESHOLDS = { green: 75, yellow: 50 };
  const PASS_PCT = 60;

  let booted = null;
  let api = null;

  function emitProgress(onProgress, stage, pct) {
    if (typeof onProgress === 'function') {
      try { onProgress({ stage, pct }); } catch (_) {}
    }
  }

  function bandFor(pct) {
    return pct >= THRESHOLDS.green ? 'green' : (pct >= THRESHOLDS.yellow ? 'yellow' : 'red');
  }

  function pageResult(result) {
    const doorFail = !!(result && result.doorFail);
    const rawWords = doorFail ? [] : ((result && result.words) || []);
    const words = rawWords.map(function (w) {
      const pct = Number(w.score) || 0;
      return { word: w.word, score: pct / 100, band: w.band || bandFor(pct), hint: typeof w.hint === 'string' ? w.hint : '' };
    });
    const scorePct = doorFail ? 0 : Math.round(Number(result && result.scorePct) || 0);
    const pass = !doorFail && scorePct >= PASS_PCT;
    return Object.assign({}, result, {
      words: words,
      overall: { score: scorePct / 100, band: bandFor(scorePct) },
      scorePct: scorePct,
      pass: pass,
      doorFail: doorFail,
      reason: (result && result.reason) || '',
      model_id: 'hubert-phoneme',
      meta: { scoring_mode: 'hubert-phoneme' },
    });
  }

  function setBase() { /* kept for old pages; the shared engine always loads from the pronounce site */ }

  async function load(onProgress) {
    if (booted) {
      const done = await booted;
      emitProgress(onProgress, 'done', 100);
      return done;
    }
    booted = (async function () {
      emitProgress(onProgress, 'download', 8);
      api = await import(SHARED_URL);
      emitProgress(onProgress, 'session', 20);
      await api.bootShared({
        onProgress: function (f) { emitProgress(onProgress, 'download', Math.round(20 + 75 * (Number(f) || 0))); },
      });
      emitProgress(onProgress, 'done', 100);
      return true;
    })().catch(function (e) {
      booted = null;
      api = null;
      throw e;
    });
    return booted;
  }

  async function grade(blob, text) {
    await load();
    const samples = await api.audio.decodeAudioToMono(blob, 16000);
    const graded = await api.gradeTrialSamples(samples, text, PASS_PCT, null, { appId: APP_ID });
    return pageResult(graded.result);
  }

  global.MRJPronounce = { setBase: setBase, load: load, grade: grade, thresholds: THRESHOLDS, passPct: PASS_PCT };
})(window);
