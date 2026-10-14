#!/usr/bin/env node
/**
 * Headless Chrome: Say mode must unlock Next after 5 tries (doorFail / fail / errors / mic-only).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function mime(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
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

async function bootSpeakPage(page, base, line) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const lineJson = JSON.stringify(line);
  await page.addScriptTag({
    content: `
      introDone = true;
      pack = {
        book_id: 'zz_test_say',
        title: 'zz_test',
        pages: [{ text: ${lineJson}, audio: '' }],
        glossary: { entries: [] },
      };
      i18n = { books: {} };
      sayPage = 0;
      sayTries = 0;
      sayMicPresses = 0;
      sayBest = 0;
      try { localStorage.removeItem('mrj_say5__zz_test_say_0'); } catch (e) {}
      mode = 'speak';
      document.getElementById('workStage').classList.remove('hidden');
      const gate = document.getElementById('mrj-auth-gate');
      if (gate) gate.style.display = 'none';
      renderSay();
    `,
  });
  await page.waitForSelector('#sayLine', { timeout: 15000 });
}

async function nextVisible(page) {
  return page.evaluate(() => {
    const el = document.getElementById('sayNext');
    return !!(el && !el.classList.contains('hidden'));
  });
}

async function triesState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('speakStatus');
    const txt = el ? el.textContent : '';
    const m = txt.match(/try (\d+) of/);
    return { status: txt, parsedTries: m ? +m[1] : null };
  });
}

function sayTargetNode(text) {
  const words = String(text || '').match(/[A-Za-z']+/g) || [];
  if (words.length === 1) return `${words[0]} ${words[0]} ${words[0]}`;
  return text;
}

async function gradeFiveTimes(page, line) {
  const gradeText = sayTargetNode(line);
  await page.evaluate(async (text) => {
    for (let i = 0; i < 5; i++) {
      const blob = new Blob([new Uint8Array(8000)], { type: 'audio/webm' });
      await gradeBlob(text, blob);
    }
  }, gradeText);
}

const { server, base } = await startServer();
const browser = await chromium.launch({ headless: true });
const LINE = 'It is here.';
const errors = [];

async function withPage(initFn, runFn) {
  const context = await browser.newContext();
  await context.addInitScript(initFn);
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  try {
    await runFn(page);
  } finally {
    await context.close();
  }
}

try {
  await withPage(
    () => {
      window.MRJPronounce = {
        load: async () => true,
        setBase: () => {},
        grade: async () => ({
          doorFail: true,
          reason: 'Say the sentence again, please. Say each word clearly.',
          overall: { score: 0, band: 'fail' },
          words: [],
          meta: { scoring_mode: 'citrinet-only' },
        }),
      };
    },
    async (page) => {
      await bootSpeakPage(page, base, LINE);
      await gradeFiveTimes(page, LINE);
      const st = await triesState(page);
      if (st.parsedTries !== 5 && !(await nextVisible(page))) {
        errors.push('doorFail: expected try 5 or Next, status=' + st.status);
      }
      if (!(await nextVisible(page))) errors.push('doorFail: Next still hidden after 5 door fails');
    }
  );

  await withPage(
    () => {
      window.MRJPronounce = {
        load: async () => true,
        setBase: () => {},
        grade: async () => ({
          doorFail: false,
          overall: { score: 0.22, band: 'fail' },
          words: [],
          scorePct: 22,
          meta: { scoring_mode: 'citrinet-only' },
        }),
      };
    },
    async (page) => {
      await bootSpeakPage(page, base, LINE);
      await gradeFiveTimes(page, LINE);
      if (!(await nextVisible(page))) errors.push('low score: Next hidden after 5 fails');
    }
  );

  await withPage(
    () => {
      window.MRJPronounce = {
        load: async () => true,
        setBase: () => {},
        grade: async () => {
          throw new Error('timeout');
        },
      };
    },
    async (page) => {
      await bootSpeakPage(page, base, LINE);
      await gradeFiveTimes(page, LINE);
      if (!(await nextVisible(page))) errors.push('grade errors: Next hidden after 5 errors');
    }
  );

  await withPage(
    () => {},
    async (page) => {
      await bootSpeakPage(page, base, LINE);
      await page.addScriptTag({
        content: 'for (let i = 0; i < 5; i++) noteSayMicPress();',
      });
      await page.waitForTimeout(50);
      if (!(await nextVisible(page))) errors.push('mic safety: Next hidden after 5 mic presses');
    }
  );

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await bootSpeakPage(page, base, 'Sam');
  const triple = await page.evaluate(() => sayTarget('Sam'));
  if (triple !== 'Sam Sam Sam') errors.push('sayTarget triple expected spaces, got: ' + triple);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('say-max-tries: ok');
