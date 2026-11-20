/* Checks for relay request 12 (help desk route). Run: node test-helpdesk.mjs
   Loads helpdesk-route.mjs on its own, with stand-ins for the relay's respond, parseBody and updateRepoJson,
   so it runs without AWS or GitHub. */
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = {}; let failNext = null;
const ctx = {
  console, Date, Number, String, Math, Map, Object, Array, JSON, RegExp,
  respond: (status, body) => ({ status, body }),
  parseBody: ev => { try { return { body: JSON.parse(ev.body || '{}') }; } catch { return { error: { status: 400, body: { error: 'BAD_JSON' } } }; } },
  updateRepoJson: async (r, branch, p, fn) => { if (failNext && p.includes(failNext)) { failNext = null; return { error: 'GITHUB' }; } repo[p] = fn(JSON.parse(JSON.stringify(repo[p] || {}))); return { ok: true }; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(here, 'helpdesk-route.mjs'), 'utf8') + '\nthis.helpdeskSubmit = helpdeskSubmit; this.hdSeen = hdSeen;', ctx);
const proj = { key: 'mismo-link', repo: 'GitMISMO/mismo-link-data', origin: 'https://resources.mismo.org' };
const H = { origin: 'https://resources.mismo.org' };
let n = 0, bad = 0;
const ok = (cond, what) => { n++; if (!cond) { bad++; console.log('FAIL', what); } };
const ev = (body, ip = '1.1.1.1') => ({ body: JSON.stringify(body), requestContext: { http: { sourceIp: ip } } });
const base = () => ({ startedAt: Date.now() - 10000, website: '', name: 'Brad Butner', email: 'BButner@take3tech.com', company: 'Take Three', type: 'Question', text: 'How do I map a Type field?' });
const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');

let r = await ctx.helpdeskSubmit(ev(base()), proj, { origin: 'https://evil.example' });
ok(r.status === 403, 'other origin refused');
r = await ctx.helpdeskSubmit(ev({ ...base(), website: 'spam' }), proj, H);
ok(r.status === 200 && r.body.reference === null && !repo['data/helpdesk.json'], 'honeypot looks accepted, keeps nothing');
r = await ctx.helpdeskSubmit(ev({ ...base(), startedAt: Date.now() }), proj, H);
ok(r.body.reference === null, 'too fast is ignored');
r = await ctx.helpdeskSubmit(ev({ ...base(), email: 'nope' }), proj, H);
ok(r.status === 400 && r.body.problems.some(p => /email/i.test(p)), 'bad email refused');
r = await ctx.helpdeskSubmit(ev({ ...base(), type: 'Other' }), proj, H);
ok(r.status === 400, 'unknown type refused');
r = await ctx.helpdeskSubmit(ev({ ...base(), text: '' }), proj, H);
ok(r.status === 400, 'empty description refused');
repo['data/helpdesk.json'] = { docs: { 'tickets/MLHD-00053': { id: 'MLHD-00053' }, settings: { level1: {} } } };
r = await ctx.helpdeskSubmit(ev(base()), proj, H);
ok(r.status === 200 && r.body.reference === 'MLHD-00054', 'numbered after the highest ticket');
const t = repo['data/helpdesk.json'].docs['tickets/MLHD-00054'];
ok(t && t.status === 'New' && t.email === 'bbutner@take3tech.com' && t.source === 'Help form', 'ticket saved, email lower-cased');
ok(repo['data/helpdesk.json'].docs.settings, 'other keys kept');
r = await ctx.helpdeskSubmit(ev({ ...base(), file: { name: 'shot.png', type: 'image/png', data: png } }, '2.2.2.2'), proj, H);
ok(r.body.reference === 'MLHD-00055' && repo['data/hdfile00055.json'] && repo['data/hdfile00055.json'].data === png, 'screenshot kept in its own file');
ok(repo['data/helpdesk.json'].docs['tickets/MLHD-00055'].files[0].doc === 'hdfile00055', 'ticket lists the screenshot');
r = await ctx.helpdeskSubmit(ev({ ...base(), file: { name: 'x.exe', type: 'application/x-msdownload', data: 'data:application/x-msdownload;base64,AAAA' } }, '3.3.3.3'), proj, H);
ok(r.status === 400, 'non-image file refused');
r = await ctx.helpdeskSubmit(ev({ ...base(), file: { name: 'big.png', type: 'image/png', data: 'data:image/png;base64,' + 'A'.repeat(4_300_000) } }, '4.4.4.4'), proj, H);
ok(r.status === 400 && /3 MB/.test(r.body.problems.join(' ')), 'screenshot over 3 MB refused');
r = await ctx.helpdeskSubmit({ body: 'x'.repeat(4_600_000), requestContext: { http: { sourceIp: '5.5.5.5' } } }, proj, H);
ok(r.status === 413, 'oversized body refused');
failNext = 'hdfile';
r = await ctx.helpdeskSubmit(ev({ ...base(), file: { name: 'shot.png', type: 'image/png', data: png } }, '6.6.6.6'), proj, H);
const t57 = repo['data/helpdesk.json'].docs['tickets/' + r.body.reference];
ok(r.status === 200 && t57 && t57.files.length === 0 && /could not be saved/.test(t57.log[0].text), 'failed screenshot noted, request kept');
failNext = 'helpdesk.json';
r = await ctx.helpdeskSubmit(ev(base(), '7.7.7.7'), proj, H);
ok(r.status === 502, 'a failed save says so');
for (let i = 0; i < 5; i++) await ctx.helpdeskSubmit(ev(base(), '8.8.8.8'), proj, H);
r = await ctx.helpdeskSubmit(ev(base(), '8.8.8.8'), proj, H);
ok(r.status === 429, 'six an hour from one address refused');
console.log((n - bad) + ' of ' + n + ' checks passed');
process.exit(bad ? 1 : 0);
