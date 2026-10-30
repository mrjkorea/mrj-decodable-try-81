#!/usr/bin/env node
/**
 * Headless Chromium: books 81–100 play the letter-intro video after the sound card and before the famous word.
 * The real letter-intro mp4s are not in git yet, so a repo clip (with audio) stands in for them.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_STUDENT = 'zz_test_mrjmetrics';
const STAND_IN = await readFile(path.join(root, 'assets/decodable/lawbreaker/jail_have.mp4'));

function mime(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  if (filePath.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(root, urlPath.replace(/^\//, ''));
      try {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': mime(filePath) });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}/` });
    });
  });
}

const { server, base } = await startServer();
const browser = await chromium.launch();

/** Fresh signed-in page on the library. `videos`: letter-intro file names served with the stand-in clip. */
async function openApp({ videos = [], viewport = { width: 1280, height: 800 }, alignPatch = null, initScript = null } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  if (initScript) await page.addInitScript(initScript);
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  const warnings = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) {
      const name = decodeURIComponent(new URL(url).pathname.split('/').pop());
      if (url.includes('/assets/decodable/letter_intro/') && videos.includes(name)) {
        return route.fulfill({ status: 200, contentType: 'video/mp4', body: STAND_IN });
      }
      if (alignPatch && url.includes('/assets/align_')) {
        const res = await route.fetch();
        const json = alignPatch(await res.json());
        return route.fulfill({ response: res, json });
      }
      return route.continue();
    }
    if (url.includes('mrj-signin/mrj-auth.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.MRJ_AUTH=window.MRJ_AUTH||{};' });
    }
    if (url.includes('mrj-signin/')) return route.fulfill({ status: 200, body: '' });
    if (url.includes('pronounce/src/shared.js')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'export async function bootShared(){}',
      });
    }
    if (url.includes('script.google.com')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await page.addInitScript((id) => {
    localStorage.setItem('mrj-dec-student', id);
    window.MRJ_AUTH = {
      student: () => String(localStorage.getItem('mrj-dec-student') || '').trim(),
      token: () => 'mock-token',
      signOut: () => localStorage.removeItem('mrj-dec-student'),
      packReady: () => true,
      loadPack: () => Promise.resolve({ ok: true, found: false, progress_json: '' }),
      savePack: () => {},
    };
  }, TEST_STUDENT);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#libStage:not(.hidden)');
  await page.evaluate(() => {
    window.__posts = [];
    MRJ_SCORES.post = (opts) => { window.__posts.push(opts); return Promise.resolve({ status: 'test' }); };
  });
  return { context, page, pageErrors, warnings };
}

const state = (page) => page.evaluate(() => {
  const go = document.getElementById('introGo');
  const v = document.getElementById('letterIntroVid');
  return {
    introStep, mode, introDone, letterIntroDone,
    badge: document.getElementById('modeBadge').textContent,
    goText: go.textContent, goDisabled: go.disabled,
    bleed: document.getElementById('introStage').classList.contains('intro-bleed'),
    introVisible: !document.getElementById('introStage').classList.contains('hidden'),
    src: v ? v.getAttribute('src') : null,
    paused: v ? v.paused : null,
  };
});

async function openBookCard(page, id) {
  await page.click(`#libList .card[data-id="${id}"]`);
  await page.waitForFunction((bid) => pack && pack.book_id === bid && mode === 'intro' && introStep === 'cousin', id);
}

/** Sound card → Next → letter intro, already playing. */
async function toLetterIntro(page) {
  await page.click('#introGo');
  await page.waitForFunction(() => introStep === 'letter-intro');
  await page.waitForFunction(() => {
    const v = document.getElementById('letterIntroVid');
    return v && !v.paused && v.currentTime > 0;
  });
}

async function finishVideo(page) {
  await page.evaluate(() => { document.getElementById('letterIntroVid').playbackRate = 16; });
  await page.waitForFunction(() => letterIntroDone && !document.getElementById('introGo').disabled);
}

const letterIntroPosts = (page, bookId) =>
  page.evaluate((bid) => window.__posts.filter((p) => p.itemId === bid + ':letter-intro').length, bookId);

async function scenario(name, fn) {
  try {
    await fn();
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL ' + name + '\n' + (e && e.stack || e));
    process.exitCode = 1;
  }
}

try {
  await scenario('book 81: sound card → letter intro (Next locked until ended) → famous card', async () => {
    const { context, page, pageErrors } = await openApp({ videos: ['silent_t_letter_intro.mp4'] });
    await openBookCard(page, 'mlr_dec_081');
    assert.equal((await state(page)).badge, 'T', 'sound card first');
    await toLetterIntro(page);
    let s = await state(page);
    assert.equal(s.badge, 'Letter intro');
    assert.ok(s.bleed, 'letter intro uses the full-bleed stage');
    assert.match(s.src, /^\/assets\/decodable\/letter_intro\/silent_t_letter_intro\.mp4\?v=/, 'path comes from asset()');
    assert.equal(s.goText, 'Next');
    assert.equal(s.goDisabled, true, 'Next is locked while the video plays');
    assert.equal(await page.evaluate(() => !!document.getElementById('letterIntroVid').muted), false, 'video plays with sound');
    assert.equal(await letterIntroPosts(page, 'mlr_dec_081'), 0, 'nothing reported before the end');

    await finishVideo(page);
    s = await state(page);
    assert.equal(s.goText, 'Next');
    const prog = await page.evaluate(() => bookProg('mlr_dec_081'));
    assert.equal(prog['letter-intro'], true, "reportIntroStep('letter-intro') saved the step");
    assert.equal(prog.reported['letter-intro'], true);
    assert.equal(await letterIntroPosts(page, 'mlr_dec_081'), 1, 'one completion row for the letter intro');

    await page.click('#introGo');
    s = await state(page);
    assert.equal(s.introStep, 'famous-card');
    assert.equal(s.badge, 'Famous word');
    assert.equal(s.bleed, false, 'full-bleed is only for the letter intro');
    assert.match(await page.textContent('#introBody'), /action/);

    await page.evaluate(() => testBackIntro());
    s = await state(page);
    assert.equal(s.introStep, 'letter-intro', 'back from the famous card → letter intro');
    assert.equal(s.goDisabled, false, 'already watched: Next stays open');
    await page.evaluate(() => testBackIntro());
    s = await state(page);
    assert.equal(s.introStep, 'cousin', 'back from the letter intro → sound card');
    assert.equal(s.badge, 'T');

    await page.click('#introGo');
    await page.waitForFunction(() => introStep === 'letter-intro' && !document.getElementById('introGo').disabled);
    await page.click('#introGo');
    await page.click('#introGo');
    s = await state(page);
    assert.equal(s.introStep, 'famous', 'famous-card → famous word still follows');
    assert.ok(await page.$('#carpetVid'), 'red-carpet video rendered');
    assert.equal(s.goDisabled, true, 'famous gate unchanged');
    await page.evaluate(() => { famousVidEnded = true; famousAudEnded = true; syncFamousGate(); });
    await page.click('#introGo');
    s = await state(page);
    assert.equal(s.mode, 'listen', 'famous word → Listen still works');
    assert.equal(s.introDone, true);
    assert.equal(await letterIntroPosts(page, 'mlr_dec_081'), 1, 'watching again does not report twice');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await scenario('book 100 (no famous word): letter intro → Listen without the old recursion', async () => {
    const { context, page, pageErrors } = await openApp({ videos: ['eigh_letter_intro.mp4'] });
    await openBookCard(page, 'mlr_dec_100');
    await toLetterIntro(page);
    assert.match((await state(page)).src, /eigh_letter_intro\.mp4/);
    await finishVideo(page);
    await page.click('#introGo');
    const s = await state(page);
    assert.equal(s.mode, 'listen');
    assert.equal(s.introDone, true);
    assert.ok(await page.isVisible('#bookStage'));
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await scenario('missing mp4 (before the upload): skips to the famous card, nothing reported', async () => {
    const { context, page, pageErrors, warnings } = await openApp({ videos: [] });
    await openBookCard(page, 'mlr_dec_082');
    await page.click('#introGo');
    await page.waitForFunction(() => introStep === 'famous-card');
    const s = await state(page);
    assert.equal(s.badge, 'Famous word');
    assert.equal(s.bleed, false);
    assert.equal(await letterIntroPosts(page, 'mlr_dec_082'), 0);
    assert.equal((await page.evaluate(() => bookProg('mlr_dec_082')))['letter-intro'], undefined);
    assert.ok(warnings.some((w) => w.includes('letter intro video failed')), 'missing file is logged');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await scenario('align without letter_intros: LETTER_INTRO fallback picks the file', async () => {
    const { context, page } = await openApp({
      videos: ['soft_g_letter_intro.mp4'],
      alignPatch: (json) => { delete json.letter_intros; return json; },
    });
    await openBookCard(page, 'mlr_dec_083');
    assert.equal(await page.evaluate(() => 'letter_intros' in pack), false);
    await toLetterIntro(page);
    assert.match((await state(page)).src, /\/assets\/decodable\/letter_intro\/soft_g_letter_intro\.mp4\?v=/);
    await context.close();
  });

  await scenario('autoplay blocked: Next turns into ▶ Play, then locks until the end', async () => {
    // Playwright input and evaluate both count as user gestures, so emulate a browser that blocks autoplay:
    // the autoplay attribute never fires and play() rejects until the test lifts the block.
    const blockAutoplay = () => {
      window.__blockAutoplay = true;
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.id === 'letterIntroVid' && window.__blockAutoplay) n.removeAttribute('autoplay');
        }
      }).observe(document, { childList: true, subtree: true });
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.id === 'letterIntroVid' && window.__blockAutoplay) {
          return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'));
        }
        return play.call(this);
      };
    };
    const { context, page } = await openApp({ videos: ['ch_k_letter_intro.mp4'], initScript: blockAutoplay });
    await openBookCard(page, 'mlr_dec_084');
    await page.click('#introGo');
    await page.waitForFunction(() => document.getElementById('introGo').textContent === '▶ Play');
    let s = await state(page);
    assert.equal(s.introStep, 'letter-intro');
    assert.equal(s.goDisabled, false, '▶ Play is tappable');
    assert.equal(s.paused, true);
    await page.evaluate(() => { window.__blockAutoplay = false; });
    await page.click('#introGo');
    await page.waitForFunction(() => document.getElementById('introGo').textContent === 'Next');
    s = await state(page);
    assert.equal(s.paused, false, 'tapping ▶ Play starts the video');
    assert.equal(s.goText, 'Next');
    assert.equal(s.goDisabled, true);
    await finishVideo(page);
    await context.close();
  });

  await scenario('leaving mid-video pauses it; reopening starts the intro over', async () => {
    const { context, page } = await openApp({ videos: ['o_short_u_letter_intro.mp4'] });
    await openBookCard(page, 'mlr_dec_085');
    await toLetterIntro(page);
    await page.click('#btnLibrary');
    await page.waitForSelector('#libStage:not(.hidden)');
    assert.equal(await page.evaluate(() => document.getElementById('letterIntroVid').paused), true, 'no narration behind the library');
    await openBookCard(page, 'mlr_dec_085');
    await toLetterIntro(page);
    assert.equal((await state(page)).goDisabled, true, 'a new visit must watch to the end again');
    await context.close();
  });

  await scenario('reported dedupe survives a pack reload', async () => {
    const { context, page, pageErrors } = await openApp({ videos: ['tion_letter_intro.mp4'] });
    await openBookCard(page, 'mlr_dec_086');
    await toLetterIntro(page);
    await finishVideo(page);
    assert.equal(await letterIntroPosts(page, 'mlr_dec_086'), 1);
    await page.evaluate(() => applySheetProgress(progressBlob()));
    const merged = await page.evaluate(() => bookProg('mlr_dec_086'));
    assert.equal(merged['letter-intro'], undefined, 'merge drops the section key');
    assert.equal(merged.reported['letter-intro'], true, 'flag map survives the merge');
    await page.evaluate(() => reportIntroStep('letter-intro'));
    assert.equal(await letterIntroPosts(page, 'mlr_dec_086'), 1, 'no duplicate after reload');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await scenario(`full-bleed layout at ${viewport.width}x${viewport.height}`, async () => {
      const { context, page } = await openApp({ videos: ['sion_letter_intro.mp4'], viewport });
      await openBookCard(page, 'mlr_dec_087');
      await toLetterIntro(page);
      const g = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const doc = document.documentElement;
        return {
          vw: doc.clientWidth, scrollW: doc.scrollWidth,
          stage: r('introStage'), body: r('introBody'), vid: r('letterIntroVid'), go: r('introGo'),
          bar: document.querySelector('.bar').getBoundingClientRect(),
        };
      });
      assert.ok(Math.abs(g.stage.left) <= 1 && Math.abs(g.stage.width - g.vw) <= 1, 'stage runs edge to edge');
      assert.ok(g.scrollW <= g.vw + 1, 'no horizontal scroll');
      assert.ok(Math.abs(g.vid.left - g.stage.left) <= 1 && Math.abs(g.vid.width - g.stage.width) <= 1, 'video spans the stage');
      assert.ok(Math.abs(g.vid.top - g.stage.top) <= 1 && Math.abs(g.vid.height - g.body.height) <= 1, 'video fills the area above Next');
      assert.ok(g.go.top >= g.vid.bottom - 1, 'Next sits below the video');
      assert.ok(g.stage.bottom <= g.bar.top + 1, 'stage stops at the mode bar');
      await context.close();
    });
  }
} finally {
  await browser.close();
  server.close();
}

if (process.exitCode) process.exit(process.exitCode);
console.log('letter-intro-flow: ok');
