// Opens MISMO Link HQ in a headless browser with a pretend sign-in and a pretend save relay,
// so the page can be checked without touching the real data. Nothing here reaches MISMO.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SESSION = `window.ResourcesSession={current:()=>({email:'tester@example.org',name:'Test Person'}),
  token:()=>'t',canEdit:()=>true,role:()=>'admin',requireAccess:()=>{document.documentElement.removeAttribute('data-rs-gate');return Promise.resolve(true);},
  signIn:()=>Promise.resolve(),onChange:()=>{},require:()=>Promise.resolve(),ready:Promise.resolve()};`;

/* made-up records, one or two in each file the page reads */
function sample() {
  return {
    feedback: { docs: {
      fb1: { id: 'fb1', company: 'Alpha Lending', name: 'Pat Tester', text: 'The summary page loads slowly.', status: 'New', on: '2026-11-20', at: '2026-11-20T15:00:00Z' },
      fb2: { id: 'fb2', company: 'Beta Bank', name: 'Lee Tester', text: 'Love the new export.', status: 'In Review', on: '2026-11-21', at: '2026-11-21T15:00:00Z' } } },
    partners: { docs: {} }, progress: { docs: {} }, signatures: { docs: {} }, settings: { docs: {} },
    helpdesk: { docs: {} }, mailin: { docs: {} }
  };
}

async function open(opts = {}) {
  const browser = opts.browser || await chromium.launch();
  const page = await browser.newPage({ viewport: { width: opts.w || 1440, height: opts.h || 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const puts = [];
  const store = opts.store || sample();
  await page.route('**/*', async r => {
    const u = r.request().url();
    if (u.startsWith('http://hq.test/mismo-link/')) return r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'index.html')), contentType: 'text/html' });
    if (u.includes('/assets/session.js')) return r.fulfill({ contentType: 'application/javascript', body: SESSION });
    if (u.includes('/assets/back.js')) return r.fulfill({ contentType: 'application/javascript', body: await backJs() });
    if (u.includes('lambda-url')) {
      const name = decodeURIComponent((u.split('/data/')[1] || '').split('?')[0]);
      if (r.request().method() === 'GET')
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify(store[name] ? { data: store[name], sha: 's0' } : { data: null }) });
      puts.push(name); /* the test copy never saves anywhere real */
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sha: 's1' }) });
    }
    if (u.startsWith('http://hq.test')) return r.fulfill({ status: 404, body: '' });
    return r.abort();
  });
  await page.goto('http://hq.test/mismo-link/');
  await page.waitForTimeout(opts.settle || 2500);
  return { browser, page, errs, puts, store, close: () => opts.browser ? page.close() : browser.close() };
}

/* The shared Back-button helper (resources.mismo.org/assets/back.js) is tested as it is live:
   MISMO_BACK can point at a local copy instead (for trying a change before it is published). */
let BACK = null;
async function backJs() {
  if (BACK !== null) return BACK;
  try {
    if (process.env.MISMO_BACK) BACK = fs.readFileSync(process.env.MISMO_BACK, 'utf8');
    else { const r = await fetch('https://resources.mismo.org/assets/back.js'); BACK = r.ok ? await r.text() : ''; }
  } catch (e) { BACK = ''; }
  return BACK;
}

module.exports = { open, ROOT };
