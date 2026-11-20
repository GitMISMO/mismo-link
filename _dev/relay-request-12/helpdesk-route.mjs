/* =====================================================================================
* MISMO LINK HELP DESK (relay request 12; Jonna, 20 Nov 2026)
* POST /mismo-link/helpdesk/submit, with no sign-in: the public help form at
* resources.mismo.org/mismo-link/help/. Built like AGREEMENTS (relay request 11): it only adds; nothing is
* read back through it. Each request becomes a ticket in data/helpdesk.json of the PRIVATE mismo-link-data
* repository ({"docs":{"tickets/MLHD-00054":{...}}}), numbered after the highest ticket already there, where
* MISMO Link HQ -> Help Desk reads it for people with MISMO Link access. An optional screenshot (image or PDF,
* 3 MB at most) is kept in its own file, data/hdfile<number>.json, and listed on the ticket.
* It sends NO email: Jonna's rule is that nothing goes out without a person sending it. The person sees their
* ticket number on screen; Kellie picks the ticket up in the Help Desk and replies from Outlook.
* Against misuse, as for ideas and agreements: an Origin from the project's own site; the hidden field; at least
* 3 seconds between opening the page and sending; at most 5 requests an hour from one address and 60 an hour in
* all (per running copy of the relay); 4.5 MB at most with a screenshot; every field checked.
* ===================================================================================== */
const HD_PROJECT = 'mismo-link', HD_PATH = 'data/helpdesk.json';
const HD_TYPES = ['Question', "Something's not working", 'Feedback'];
const HD_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const HD_PER_IP_HOUR = 5, HD_ALL_HOUR = 60, HD_MIN_MS = 3000, HD_MAX_BYTES = 4_500_000, HD_MAX_FILE = 3 * 1024 * 1024;
const hdSeen = { ip: new Map(), all: [] };
function hdAllowed(ip, now) {
const hour = now - 3_600_000;
hdSeen.all = hdSeen.all.filter(t => t > hour);
for (const [k, v] of hdSeen.ip) { const keep = v.filter(t => t > hour); if (keep.length) hdSeen.ip.set(k, keep); else hdSeen.ip.delete(k); }
const mine = hdSeen.ip.get(ip) || [];
if (mine.length >= HD_PER_IP_HOUR || hdSeen.all.length >= HD_ALL_HOUR) return false;
mine.push(now); hdSeen.ip.set(ip, mine); hdSeen.all.push(now); return true;
}
function cleanHelp(b) {
const problems = [], text = (v, max, one) => { let t = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n'); if (one) t = t.replace(/\s+/g, ' '); t = t.trim(); return t.length > max ? null : t; };
const f = (key, max, one, need, say) => { const t = text(b[key], max, one); if (t === null) { problems.push(say + ' is too long (' + max + ' characters at most).'); return ''; } if (need && t.length < need) problems.push(say + ' is needed.'); return t; };
const s = {
name: f('name', 120, true, 2, 'Your name'), email: f('email', 200, true, 0, 'Work email').toLowerCase(),
company: f('company', 200, true, 2, 'Company'), type: f('type', 40, true, 1, 'What you need'),
text: f('text', 8000, false, 5, 'Tell us about it'), pageUrl: f('pageUrl', 300, true, 0, 'The page'), userAgent: f('userAgent', 400, true, 0, 'The browser')
};
if (!/^[^\s@]{1,64}@[^\s@]+\.[A-Za-z]{2,}$/.test(s.email)) problems.push('A work email address is needed.');
if (s.type && !HD_TYPES.includes(s.type)) problems.push('Please choose what you need.');
let file = null;
if (b.file && typeof b.file === 'object') {
const name = text(b.file.name, 200, true) || 'screenshot', type = String(b.file.type || ''), data = String(b.file.data || '');
const m = data.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
const size = m ? Math.floor(m[2].length * 3 / 4) - (m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0) : 0;
if (!m || !HD_FILE_TYPES.includes(m[1]) || (type && type !== m[1])) problems.push('The screenshot must be an image or a PDF.');
else if (size > HD_MAX_FILE) problems.push('The screenshot is over 3 MB.');
else file = { name, type: m[1], size, data };
}
return { s, file, problems };
}
async function helpdeskSubmit(event, proj, headers) {
if (headers['origin'] !== proj.origin) return respond(403, { error: 'ORIGIN', message: 'This page only works from MISMO’s own site.' });
if (String(event.body || '').length > HD_MAX_BYTES) return respond(413, { error: 'TOO_LARGE', message: 'That is more than the form sends. Try a smaller screenshot, or email linksupport@mismo.org.' });
const parsed = parseBody(event); if (parsed.error) return parsed.error;
const b = parsed.body || {}, now = Date.now();
const started = Number(b.startedAt);
if (String(b.website || '').trim() || !Number.isFinite(started) || now - started < HD_MIN_MS) return respond(200, { ok: true, reference: null }); /* a robot: as if accepted, kept nowhere */
const ip = (event.requestContext && event.requestContext.http && event.requestContext.http.sourceIp) || 'unknown';
const { s, file, problems } = cleanHelp(b);
if (problems.length) return respond(400, { error: 'INVALID', problems });
if (!hdAllowed(ip, now)) return respond(429, { error: 'TOO_MANY', message: 'A few requests have just come from here. Please try again in an hour, or email linksupport@mismo.org.' });
const at = new Date(now).toISOString(); let ref = null;
const w = await updateRepoJson(proj.repo, proj.branch || 'main', HD_PATH, d => {
d.docs = d.docs && typeof d.docs === 'object' ? d.docs : {};
const n = Object.keys(d.docs).map(k => Number((k.match(/^tickets\/MLHD-(\d+)$/) || [])[1]) || 0).reduce((a, x) => Math.max(a, x), 0) + 1;
ref = 'MLHD-' + String(n).padStart(5, '0');
d.docs['tickets/' + ref] = {
id: ref, at, source: 'Help form', status: 'New', ip,
name: s.name, email: s.email, company: s.company, type: s.type, text: s.text, pageUrl: s.pageUrl, userAgent: s.userAgent,
files: file ? [{ name: file.name, type: file.type, size: file.size, doc: 'hdfile' + ref.slice(5), at }] : [], log: []
};
return d;
}, 'Help desk request');
if (w.error) return respond(502, { error: 'NOT_SAVED', message: 'Your request couldn’t be saved just now. Please try again in a minute, or email linksupport@mismo.org.' });
if (file) {
/* The ticket is already saved; a screenshot that fails to save is noted on the ticket rather than losing the request. */
const fw = await updateRepoJson(proj.repo, proj.branch || 'main', 'data/hdfile' + ref.slice(5) + '.json', () => ({ ...file, ticket: ref, at }), 'Help desk screenshot ' + ref);
if (fw.error) {
console.warn('helpdesk file:', ref, fw.error);
await updateRepoJson(proj.repo, proj.branch || 'main', HD_PATH, d => { const t = d.docs && d.docs['tickets/' + ref]; if (t) { t.files = []; t.log = (t.log || []).concat([{ kind: 'note', at, by: 'Help form', text: 'They attached ' + file.name + ' but it could not be saved. Ask them to email it.' }]); } return d; }, 'Help desk screenshot not saved').catch(() => {});
}
}
return respond(200, { ok: true, reference: ref });
}
