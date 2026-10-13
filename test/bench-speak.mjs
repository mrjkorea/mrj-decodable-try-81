#!/usr/bin/env node
/**
 * Headless Chrome benchmark: Citrinet-only MRJPronounce boot + grade (fake mic WAV).
 * Usage: node test/bench-speak.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'It is here.';
const WAV = path.join(root, 'test', 'bench-wavs', 'correct-it-is-here.wav');

function mime(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.wav')) return 'audio/wav';
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
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(300000);

const bytesByUrl = new Map();
let bootBytes = 0;
page.on('response', async (res) => {
  const url = res.url();
  if (!url.includes('/models/') && !url.includes('/vendor/ort/') && !url.includes('/pronounce/')) return;
  try {
    const body = await res.body();
    const prev = bytesByUrl.get(url) || 0;
    if (prev === 0) bootBytes += body.length;
    bytesByUrl.set(url, prev + body.length);
  } catch (_) {}
});

const t0 = Date.now();
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ url: base + 'pronounce/audio.js' });
await page.addScriptTag({ url: base + 'pronounce/grade-browser.js' });
await page.evaluate(async () => {
  window.__bench = { err: null, grade: null };
  try {
    await window.MRJPronounce.load();
    window.__bench.ready = true;
  } catch (e) {
    window.__bench.err = String(e && e.message ? e.message : e);
  }
});
await page.waitForFunction(() => window.__bench && (window.__bench.ready || window.__bench.err), { timeout: 300000 });
const bootMs = Date.now() - t0;
const bootErr = await page.evaluate(() => window.__bench.err);
if (bootErr) throw new Error('boot failed: ' + bootErr);

const wavBuf = await readFile(WAV);
const gradeStart = Date.now();
const grade = await page.evaluate(
  async ({ b64, line }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const t = performance.now();
    const j = await window.MRJPronounce.grade(blob, line);
    return { ms: performance.now() - t, j };
  },
  { b64: wavBuf.toString('base64'), line: TARGET }
);
const gradeMs = Date.now() - gradeStart;

const report = {
  bootMs,
  bootBytes,
  gradeMs,
  gradeInnerMs: Math.round(grade.ms),
  scoring_mode: grade.j.meta && grade.j.meta.scoring_mode,
  doorFail: grade.j.doorFail,
  scorePct: grade.j.scorePct,
  model_id: grade.j.model_id,
  fetched: [...bytesByUrl.entries()].map(([u, n]) => ({ url: u.replace(base, ''), bytes: n })),
};

console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();

if (report.scoring_mode !== 'citrinet-only') {
  process.exit(1);
}
