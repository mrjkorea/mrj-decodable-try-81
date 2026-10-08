import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_STUDENT = 'zz_test_mrjmetrics';

function mime(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(root, urlPath.replace(/^\//, ''));
      try {
        const body = readFileSync(filePath);
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

const widths = [360, 390, 414, 1280];

const { server, base } = await startServer();
const browser = await chromium.launch();
const positions = [];

async function stubExternal(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('mrj-signin/mrj-auth-boot.js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* test stub */' });
    }
    if (url.includes('mrj-signin/mrj-auth.js')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.MRJ_AUTH=window.MRJ_AUTH||{};',
      });
    }
    if (url.includes('mrj-signin/mrj-auth.css')) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    if (url.includes('mrj-decodable-try/pronounce/')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' });
    }
    return route.continue();
  });
}

async function mockSignedIn(page, student) {
  await page.addInitScript((id) => {
    localStorage.setItem('mrj-dec-student', id);
    window.MRJ_AUTH = {
      student: () => String(localStorage.getItem('mrj-dec-student') || '').trim(),
      token: () => 'mock-token',
      signOut: () => {
        localStorage.removeItem('mrj-dec-student');
      },
      packReady: () => true,
      loadPack: () => Promise.resolve({ ok: true, found: false, progress_json: '' }),
      savePack: () => {},
    };
    window.dispatchEvent(new CustomEvent('mrj-auth-ready', { detail: { id } }));
  }, student);
}

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await stubExternal(page);
    await mockSignedIn(page, TEST_STUDENT);

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#libStage:not(.hidden)', { timeout: 15000 });

    const title = await page.title();
    assert.match(title, /Books 81-100/);

    const badge = await page.locator('#modeBadge').textContent();
    assert.match(badge || '', /Books 81-100/);

    const bookCount = await page.locator('#libList .card').count();
    assert.equal(bookCount, 20);

    const band = await page.locator('#bandLink').textContent();
    assert.match(band || '', /Books 61-80/);

    const header = await page.evaluate(() => {
      const doc = document.documentElement;
      const pill = document.querySelector('[data-mrj-name-pill]');
      const hdr = document.querySelector('header');
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        header: rect(hdr),
        pill: rect(pill),
        lang: rect(document.getElementById('langPick')),
        books: rect(document.getElementById('btnLibrary')),
        switch: rect(document.getElementById('btnSwitch')),
      };
    });

    assert.ok(header.scrollW <= header.clientW + 1, `horizontal scroll at ${width}px`);
    assert.ok(header.pill && header.pill.w >= 0, 'pill missing');
    positions.push({ width, ...header });
    await page.close();
  }

  const reloadPage = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await stubExternal(reloadPage);
  await mockSignedIn(reloadPage, TEST_STUDENT);
  await reloadPage.goto(base, { waitUntil: 'domcontentloaded' });
  await reloadPage.reload({ waitUntil: 'domcontentloaded' });
  await reloadPage.waitForSelector('#libStage:not(.hidden)', { timeout: 15000 });
  await reloadPage.close();

  console.log('playwright-header: ok');
  console.log(JSON.stringify({ positions }, null, 2));
} finally {
  await browser.close();
  server.close();
}
