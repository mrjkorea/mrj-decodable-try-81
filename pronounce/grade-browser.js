/* MRJ Decodable — Citrinet-only in-page grader (int8 ONNX + onnxruntime-web WASM). */
(function (global) {
  const MODEL_ORIGIN = 'https://mrjkorea.github.io/pronounce/';
  const ORT_SRC = MODEL_ORIGIN + 'vendor/ort/ort.wasm.min.js';
  const WASM_PATHS = MODEL_ORIGIN + 'vendor/ort/';
  const CITRINET_PATHS = [
    MODEL_ORIGIN + 'models/citrinet/model.int8.onnx',
    MODEL_ORIGIN + 'models/citrinet/sp_pieces.json',
  ];
  const PASS_AT = 60;
  const CACHE_TAG = '20261014-citrinet-only';

  let assetBase = '';
  let booted = null;
  let trialApi = null;

  function resolvePronounceBase() {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      if (src.indexOf('grade-browser.js') >= 0) {
        return src.replace(/grade-browser\.js.*$/, '');
      }
    }
    const p = location.pathname.replace(/[^/]*$/, '');
    return location.origin + p + 'pronounce/';
  }

  function setBase(url) {
    assetBase = url ? String(url) : resolvePronounceBase();
  }

  function trialModuleUrl() {
    const base = assetBase || resolvePronounceBase();
    return base + 'src/trial.js?v=' + CACHE_TAG;
  }

  function emitProgress(onProgress, stage, pct) {
    if (typeof onProgress === 'function') {
      try { onProgress({ stage, pct }); } catch (_) {}
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const nodes = document.getElementsByTagName('script');
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].src === src && nodes[i].dataset.mrjReady === '1') {
          resolve();
          return;
        }
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { s.dataset.mrjReady = '1'; resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function pageResult(result) {
    const doorFail = !!(result && result.doorFail);
    const rawWords = doorFail ? [] : ((result && result.words) || []);
    const words = rawWords.map(function (w) {
      return {
        word: w.word,
        score: (Number(w.score) || 0) / 100,
        hint: typeof w.hint === 'string' ? w.hint : '',
      };
    });
    const score = doorFail ? 0 : (Number(result && result.score) || 0);
    const pass = doorFail ? false : !!(result && result.pass);
    const scorePct = doorFail ? 0 : Math.round(Number(result && result.scorePct) || score * 100);
    return Object.assign({}, result, {
      words: words,
      overall: { score: score, band: pass ? 'pass' : 'fail' },
      scorePct: scorePct,
      pass: pass,
      doorFail: doorFail,
      reason: (result && result.reason) || '',
      model_id: 'citrinet-only',
      meta: { scoring_mode: 'citrinet-only' },
    });
  }

  async function load(onProgress) {
    if (!assetBase) setBase('');
    if (booted) {
      const done = await booted;
      emitProgress(onProgress, 'done', 100);
      return done;
    }
    booted = (async function () {
      emitProgress(onProgress, 'download', 8);
      await loadScript(ORT_SRC);
      emitProgress(onProgress, 'download', 22);
      trialApi = await import(trialModuleUrl());
      emitProgress(onProgress, 'session', 40);
      await trialApi.bootTrialInPage({
        mode: 'citrinet-only',
        loadHints: false,
        wasmPaths: WASM_PATHS,
        paths: CITRINET_PATHS,
      });
      emitProgress(onProgress, 'done', 100);
      return true;
    })().catch(function (e) {
      booted = null;
      trialApi = null;
      throw e;
    });
    return booted;
  }

  async function grade(blob, text) {
    await load();
    if (typeof global.decodeAudioToMono !== 'function') {
      throw new Error('decodeAudioToMono is not on the page');
    }
    const samples = await global.decodeAudioToMono(blob, 16000);
    const graded = await trialApi.gradeTrialSamples(samples, text, PASS_AT);
    return pageResult(graded.result);
  }

  global.MRJPronounce = { setBase: setBase, load: load, grade: grade };
})(window);
