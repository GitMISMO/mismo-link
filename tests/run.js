// MISMO Link HQ checks. Run with:  npm test   (or: node tests/run.js "back")
// Every check opens the page against a pretend relay with made-up data, so nothing real is
// read or changed. The run fails (exit code 1) if any check fails.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const { open, ROOT } = require('./harness');

const results = [];
const only = process.argv.slice(2);
async function check(name, fn) {
  if (only.length && !only.some(o => name.toLowerCase().includes(o.toLowerCase()))) return;
  try { await fn(); results.push({ name, ok: true }); console.log('  PASS  ' + name); }
  catch (e) { results.push({ name, ok: false }); console.log('  FAIL  ' + name + '\n        ' + String(e.message).split('\n').join('\n        ')); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const noErrors = errs => expect(!errs.length, 'Page errors:\n' + errs.join('\n'));
const htmlFiles = () => ['index.html'].concat(fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'index.html')))
  .map(d => d.name + '/index.html'));

(async () => {
  const browser = await chromium.launch();
  const opts = o => Object.assign({ browser }, o || {});

  /* 1. Every script on every page reads as valid JavaScript */
  await check('Every page script parses', async () => {
    const bad = [];
    for (const f of htmlFiles()) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m, i = 0;
      while ((m = re.exec(html))) {
        i++; if (/type=["'](?!text\/javascript|module)/.test(m[1])) continue;
        try { new vm.Script(m[2], { filename: f + ' script ' + i }); } catch (e) { bad.push(f + ' script ' + i + ': ' + e.message); }
      }
    }
    expect(!bad.length, bad.join('\n'));
  });

  /* 2. back.js is loaded from the shared copy, never copied in, and nothing else changes the history */
  await check('Back helper: loaded from /assets/back.js, never copied in', async () => {
    const bad = [];
    for (const f of htmlFiles()) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/MismoBack\s*=\s*\{/.test(html)) bad.push(f + ' has its own copy of back.js');
      if (/history\.pushState/.test(html)) bad.push(f + ' calls history.pushState');
      if (/nav[^>]*>[\s\S]*data-hq=/.test(html)) {
        const s = html.indexOf('/assets/session.js"></script>'), b = html.indexOf('<script src="/assets/back.js"></script>');
        if (b < 0 || b < s || b > html.indexOf('</head>')) bad.push(f + ' has a left menu but no back.js line in <head> after session.js');
      }
    }
    expect(!bad.length, bad.join('\n'));
  });

  /* 3. The page opens on Overview with no errors */
  await check('Opens on Overview with no page errors', async () => {
    const s = await open(opts());
    const tab = await s.page.evaluate(() => (document.querySelector('.hq nav button[data-hq][aria-current]') || {}).dataset?.hq);
    expect(tab === 'overview', 'opened on ' + tab);
    noErrors(s.errs); expect(!s.puts.length, 'opening the page saved: ' + s.puts.join(', ')); await s.close();
  });

  /* 4. The browser's Back button: it closes what is open, then goes to the last page you were on (CN-033, Nov 25) */
  await check('Back button: closes the panel, then returns to the last page', async () => {
    const s = await open(opts());
    const state = () => s.page.evaluate(() => ({
      tab: (document.querySelector('.hq nav button[data-hq][aria-current]') || {}).dataset?.hq || '',
      pane: document.getElementById('rpane').classList.contains('open'), helper: !!window.MismoBack }));
    expect((await state()).helper, 'the shared Back helper (/assets/back.js) did not load');
    const go = async tab => { await s.page.click('.hq nav button[data-hq="' + tab + '"]'); await s.page.waitForTimeout(800); };
    const back = async () => { await s.page.evaluate(() => history.back()); await s.page.waitForTimeout(900); };
    const start = (await state()).tab;
    await go('agreement'); await go('access'); await go('help');
    let st = await state(); expect(st.tab === 'help', 'Help did not open: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === 'access', 'Back from Help should land on Testers and Access: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === 'agreement', 'Back again should land on Beta Agreement: ' + JSON.stringify(st));
    await s.page.evaluate(() => history.forward()); await s.page.waitForTimeout(900);
    st = await state(); expect(st.tab === 'access', 'Forward should go again to Testers and Access: ' + JSON.stringify(st));
    await back(); await back(); st = await state(); expect(st.tab === start, 'Back to where the page opened (' + start + '): ' + JSON.stringify(st));
    /* a record's panel: Back closes it first and stays on the page */
    await go('feedback');
    const row = await s.page.$('#app-feedback [data-fbo]');
    expect(row, 'Feedback has no rows to open');
    await row.click(); await s.page.waitForTimeout(800);
    expect((await state()).pane, 'a feedback record did not open in the right-hand panel');
    await back(); st = await state();
    expect(!st.pane && st.tab === 'feedback', 'Back should close the panel and stay on Feedback: ' + JSON.stringify(st));
    await back(); st = await state(); expect(st.tab === start, 'Back after the panel should go to the page before Feedback: ' + JSON.stringify(st));
    /* closing the panel with its X doesn't leave a step behind */
    await go('feedback'); await (await s.page.$('#app-feedback [data-fbo]')).click(); await s.page.waitForTimeout(800);
    expect((await state()).pane, 'the feedback record did not open again');
    await s.page.click('#rp-x'); await s.page.waitForTimeout(800);
    expect(!(await state()).pane, 'the Close button did not close the panel');
    await back(); st = await state(); expect(st.tab === start, 'after closing the panel with Close, Back should go straight to the page before: ' + JSON.stringify(st));
    noErrors(s.errs); expect(!s.puts.length, 'the Back check saved: ' + s.puts.join(', ')); await s.close();
  });

  /* 5. December (CN-052, Nov 26): the shared hat sits on the O of the masthead logo and nothing else moves.
        The public pages (help, sign, user, email) never load session.js or holiday.js, so never get it. */
  await check('December hat: on the masthead logo, nothing moves, never on public pages', async () => {
    const bad = [];
    for (const f of htmlFiles().filter(f => f !== 'index.html')) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/\/assets\/(session|holiday)\.js/.test(html)) bad.push(f + ' is a public page but loads session.js or holiday.js');
    }
    const hq = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    if (/data-season|class="santa"/.test(hq)) bad.push('index.html still carries the retired December hat (.santa / data-season)');
    expect(!bad.length, bad.join('\n'));
    const s = await open(opts({ query: '?holiday=preview' }));
    const box = () => s.page.evaluate(() => ['.hqtop', '.logoplate .wordmark', '.hqname', '#rail', '#rs-account'].map(q => {
      const r = document.querySelector(q).getBoundingClientRect(); return q + ' ' + [r.x, r.y, r.width, r.height].map(Math.round).join(','); }));
    const before = await box();
    /* the real session.js adds this for a signed-in MISMO or MBA address */
    await s.page.addScriptTag({ url: 'http://hq.test/assets/holiday.js' }); await s.page.waitForTimeout(1500);
    const st = await s.page.evaluate(() => {
      const h = document.querySelector('.mismo-hat'), logo = document.querySelector('header.hqtop .logoplate .wordmark');
      if (!h) return { on: !!(window.MismoHoliday || {}).on };
      const a = h.getBoundingClientRect(), b = logo.getBoundingClientRect();
      return { on: true, inHeader: !!h.closest('header.hqtop'), shown: getComputedStyle(h).display !== 'none' && a.width > 0,
        overLogo: a.left >= b.left && a.right <= b.right + a.width && a.bottom > b.top && a.top < b.bottom };
    });
    expect(st.on, 'holiday.js did not switch on with ?holiday=preview (could it be fetched?)');
    expect(st.inHeader && st.shown, 'no hat in the masthead: ' + JSON.stringify(st));
    expect(st.overLogo, 'the hat is not over the logo: ' + JSON.stringify(st));
    const after = await box();
    expect(JSON.stringify(after) === JSON.stringify(before), 'the page moved when the hat went on:\n' + before.join('\n') + '\n->\n' + after.join('\n'));
    noErrors(s.errs); expect(!s.puts.length, 'the hat check saved: ' + s.puts.join(', ')); await s.close();
  });

  /* 6. Masthead matches Certification Management's to the pixel (CN-053), and what sits under it lines up */
  await check('Masthead: Certification Management measurements, nothing overlaps or gaps', async () => {
    const want = {
      wide:  { w: 1440, h: 900, bar: 68, plate: [22, 13, 183, 42], logoH: 24, rule: [1, 42], name: '16px' },
      phone: { w: 390,  h: 844, bar: 62, plate: [16, 14.5, 144.5, 33], logoH: 19, rule: [1, 40], name: '13px' },
    };
    for (const [k, t] of Object.entries(want)) {
      const s = await open(opts({ w: t.w, h: t.h }));
      const m = await s.page.evaluate(() => {
        const r = q => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v * 10) / 10); };
        const cs = q => getComputedStyle(document.querySelector(q));
        return { bar: r('header.hqtop'), plate: r('.logoplate'), logo: r('.logoplate .wordmark'), rule: r('.hqtop .mastrule'),
          rail: r('#rail'), pane: getComputedStyle(document.querySelector('#rpane') || document.body).top,
          plateRadius: cs('.logoplate').borderTopLeftRadius, plateShadow: cs('.logoplate').boxShadow,
          barBg: cs('header.hqtop').backgroundColor, barShadow: cs('header.hqtop').boxShadow,
          name: [cs('.hqname').fontSize, cs('.hqname').fontWeight, cs('.hqname').color],
          ruleBg: cs('.hqtop .mastrule').backgroundColor, hat: !!document.querySelector('.santa,#mismo-hat') || document.documentElement.hasAttribute('data-season') };
      });
      const tag = k + ': ' + JSON.stringify(m);
      expect(m.bar[1] === 0 && m.bar[3] === t.bar, 'bar should be ' + t.bar + 'px tall at the top. ' + tag);
      expect(m.barBg === 'rgb(13, 49, 76)' && /rgba\(80, 164, 219, 0\.28\) 0px 1px 0px/.test(m.barShadow), 'bar colour or foot line wrong. ' + tag);
      expect(m.plate[0] === t.plate[0] && m.plate[1] === t.plate[1] && Math.abs(m.plate[2] - t.plate[2]) <= 1 && m.plate[3] === t.plate[3], 'logo box not at ' + t.plate.join(',') + '. ' + tag);
      expect(m.plateRadius === '5px' && /rgba\(80, 164, 219, 0\.35\) 0px 1px 0px/.test(m.plateShadow), 'logo box corners or sky line wrong. ' + tag);
      expect(m.logo[3] === t.logoH, 'logo should be ' + t.logoH + 'px tall. ' + tag);
      expect(m.rule[2] === t.rule[0] && m.rule[3] === t.rule[1] && m.ruleBg === 'rgba(80, 164, 219, 0.4)', 'divider wrong. ' + tag);
      expect(m.rule[0] - (m.plate[0] + m.plate[2]) === (k === 'wide' ? 14 : 11), 'gap from logo box to divider wrong. ' + tag);
      expect(m.name[0] === t.name && m.name[1] === '500' && m.name[2] === 'rgb(148, 200, 233)', 'tool name style wrong. ' + tag);
      expect(m.rail && m.rail[1] === t.bar, 'left menu should start right under the bar (' + t.bar + 'px). ' + tag);
      expect(m.pane === t.bar + 'px', 'right-hand panel should start at ' + t.bar + 'px. ' + tag);
      expect(!m.hat, 'the retired December hat code is still on the page. ' + tag);
      noErrors(s.errs); await s.close();
    }
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' checks passed.');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
