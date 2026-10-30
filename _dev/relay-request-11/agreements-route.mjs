/* =====================================================================================
 * MISMO LINK AI BETA AGREEMENTS (relay request 11; Jonna, 30 Oct 2026)
 * POST /mismo-link/agreements/submit, with no sign-in: the two public signing pages at
 * resources.mismo.org/mismo-link/sign/ (the company's SaaS Subscriber Agreement) and /user/ (each tester's
 * User SaaS Agreement). Built like IDEAS FROM THE PUBLIC FORM: it only adds; nothing is read back through it.
 * Each signature goes into data/signatures.json of the PRIVATE mismo-link-data repository, where MISMO Link HQ
 * (Who Has Signed, Testers and Access) reads it for people with MISMO Link access.
 * Emails: the signer gets a copy that repeats nothing they typed (the agreement, version, time and reference, and
 * what happens next); the beta team gets an alert with the details. Who the beta team is lives in
 * data/settings.json of the same repository ({"notify":[{"name","email"}]}), edited in MISMO Link HQ, so changing
 * who is told is never a relay change. If that list is empty, MISMO Link administrators are told instead.
 *   Subscriber Agreement signed -> "schedule the kick-off call within 3 business days and send the User Agreement link"
 *   User Agreement signed       -> "set this person up within 3 business days"
 * Against misuse, as for ideas: an Origin from the project's own site; the hidden field; at least 3 seconds between
 * opening the page and signing; at most 5 signatures an hour from one address and 40 an hour in all (per running copy
 * of the relay); 32 kB at most; every field checked; the typed signature must match the signer's name; only the two
 * known agreements are accepted. The signer's IP address is kept with the signature as part of the e-sign record.
 * ===================================================================================== */
const AGR_PROJECT = 'mismo-link', AGR_PATH = 'data/signatures.json', AGR_SETTINGS = 'data/settings.json';
const AGR_KNOWN = {
  'MISMO Link AI SaaS Subscriber Agreement': 'subscriber',
  'MISMO Link AI User SaaS Agreement': 'user'
};
const AGR_PAGES = { subscriber: 'https://resources.mismo.org/mismo-link/sign/', user: 'https://resources.mismo.org/mismo-link/user/' };
const AGR_HQ = 'https://resources.mismo.org/mismo-link/';
const AGR_PER_IP_HOUR = 5, AGR_ALL_HOUR = 40, AGR_MIN_MS = 3000, AGR_MAX_BYTES = 32_000;
const agrSeen = { ip: new Map(), all: [] };
function agrAllowed(ip, now) {
  const hour = now - 3_600_000;
  agrSeen.all = agrSeen.all.filter(t => t > hour);
  for (const [k, v] of agrSeen.ip) { const keep = v.filter(t => t > hour); if (keep.length) agrSeen.ip.set(k, keep); else agrSeen.ip.delete(k); }
  const mine = agrSeen.ip.get(ip) || [];
  if (mine.length >= AGR_PER_IP_HOUR || agrSeen.all.length >= AGR_ALL_HOUR) return false;
  mine.push(now); agrSeen.ip.set(ip, mine); agrSeen.all.push(now); return true;
}
/* n business days after today in Washington (weekends skipped; holidays aren't known here). */
function agrBusinessDays(nowMs, n) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
  const d = new Date(ymd + 'T12:00:00Z'); let left = n;
  while (left) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}
const agrDay = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const agrStamp = ms => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
function cleanAgreement(b) {
  const problems = [], text = (v, max, one) => { let t = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n'); if (one) t = t.replace(/\s+/g, ' '); t = t.trim(); return t.length > max ? null : t; };
  const f = (key, max, one, need, say) => { const t = text(b[key], max, one); if (t === null) { problems.push(`${say} is too long (${max} characters at most).`); return ''; } if (need && t.length < need) problems.push(`${say} is needed.`); return t; };
  const s = {
    agreementTitle: f('agreementTitle', 120, true, 1, 'The agreement'), agreementVersion: f('agreementVersion', 60, true, 1, 'The agreement version'),
    organization: f('organization', 200, true, 2, 'Company'), signerName: f('signerName', 120, true, 2, 'Full name'),
    signerTitle: f('signerTitle', 150, true, 2, 'Job title'), signerEmail: f('signerEmail', 200, true, 0, 'Work email'),
    signerPhone: f('signerPhone', 40, true, 0, 'Phone'), typedSignature: f('typedSignature', 120, true, 2, 'Your typed name'),
    acceptanceStatement: f('acceptanceStatement', 1000, true, 20, 'The acceptance statement'),
    signedOnLocal: f('signedOnLocal', 80, true, 0, 'The local time'), timeZone: f('timeZone', 60, true, 0, 'The time zone'),
    pageUrl: f('pageUrl', 300, true, 0, 'The page'), userAgent: f('userAgent', 400, true, 0, 'The browser')
  };
  s.kind = AGR_KNOWN[s.agreementTitle] || '';
  if (!s.kind && s.agreementTitle) problems.push('That is not one of the MISMO Link AI beta agreements.');
  if (!/^[^\s@]{1,64}@[^\s@]+\.[A-Za-z]{2,}$/.test(s.signerEmail)) problems.push('A work email address is needed.');
  const norm = v => String(v).toLowerCase().replace(/[^a-z]/g, '');
  if (s.typedSignature && s.signerName && norm(s.typedSignature) !== norm(s.signerName)) problems.push('The typed signature must match the full name.');
  if (b.readToEnd !== true) problems.push('The agreement must be read to the end before signing.');
  s.readToEnd = b.readToEnd === true;
  s.documentHash = /^[0-9a-f]{64}$/.test(String(b.documentHash || '')) ? String(b.documentHash) : '';
  return { s, problems };
}
async function agreementNotifyList(proj) {
  const set = await readFile(proj.repo, proj.branch || 'main', AGR_SETTINGS);
  const listed = set.status === 200 && set.data && Array.isArray(set.data.notify)
    ? set.data.notify.filter(p => p && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(String(p.email || ''))).map(p => [String(p.email).toLowerCase(), { name: String(p.name || '') }])
    : [];
  if (listed.length) return listed;
  const dir = await loadAccess();
  return dir.error ? [] : Object.entries(dir.people).filter(([, x]) => !isExpired(x) && (x.platformAdmin === true || normaliseRole((x.access || {})[AGR_PROJECT]) === 'admin'));
}
async function agreementSubmit(event, proj, headers) {
  if (headers['origin'] !== proj.origin) return respond(403, { error: 'ORIGIN', message: 'This page only works from MISMO’s own site.' });
  if (String(event.body || '').length > AGR_MAX_BYTES) return respond(413, { error: 'TOO_LARGE', message: 'That is more than the page sends. Reload it and try again.' });
  const parsed = parseBody(event); if (parsed.error) return parsed.error;
  const b = parsed.body || {}, now = Date.now();
  const started = Number(b.startedAt);
  if (String(b.website || '').trim() || !Number.isFinite(started) || now - started < AGR_MIN_MS) return respond(200, { ok: true, reference: null });   /* a robot: as if accepted, kept nowhere */
  const ip = (event.requestContext && event.requestContext.http && event.requestContext.http.sourceIp) || 'unknown';
  const { s, problems } = cleanAgreement(b);
  if (problems.length) return respond(400, { error: 'INVALID', problems });
  if (!agrAllowed(ip, now)) return respond(429, { error: 'TOO_MANY', message: 'A few agreements have just been signed from here. Please try again in an hour, or email info@mismo.org.' });
  const at = new Date(now).toISOString(), followUpBy = agrBusinessDays(now, 3); let ref = null;
  const w = await updateRepoJson(proj.repo, proj.branch || 'main', AGR_PATH, d => {
    d.docs = d.docs && typeof d.docs === 'object' ? d.docs : {};
    const n = Object.keys(d.docs).map(k => Number((k.match(/^signatures\/SIG-(\d+)$/) || [])[1]) || 0).reduce((a, x) => Math.max(a, x), 0) + 1;
    ref = 'SIG-' + String(n).padStart(4, '0');
    d.docs['signatures/' + ref] = { id: ref, submittedAt: at, followUpBy, ip, via: 'public signing page', ...s };
    return d;
  }, s.kind === 'user' ? 'User Agreement signed' : 'Subscriber Agreement signed');
  if (w.error) return respond(502, { error: 'NOT_SAVED', message: 'Your signature couldn’t be saved just now. Please try again in a minute.' });
  /* Emails: neither can undo the save, so a failure is only logged. */
  const when = agrStamp(now), due = agrDay(followUpBy);
  const next = s.kind === 'user'
    ? 'You will hear from a member of the team within 3 business days with instructions and credentials.'
    : 'You will hear from a member of the team to schedule a kick-off call within 3 business days.';
  const copy = `Hello,\n\nThank you. This confirms that the ${s.agreementTitle}, Version ${s.agreementVersion}, was signed electronically on ${when}.\n\nYour reference is ${ref}. You can read or print the agreement at any time at ${AGR_PAGES[s.kind]}\n\n${next}\n\nMISMO`;
  await sendMail({ kind: 'agreement-copy', to: s.signerEmail, subject: `Your signed ${s.agreementTitle} (${ref})`, text: copy, html: htmlOf(copy) }).catch(e => console.warn('agreement copy:', e && e.message));
  const team = await agreementNotifyList(proj).catch(() => []);
  const who = `${s.signerName}, ${s.signerTitle}\n${s.organization}\n${s.signerEmail}${s.signerPhone ? ' · ' + s.signerPhone : ''}`;
  for (const [email, x] of team) {
    const t = s.kind === 'user'
      ? `Hello ${x.name || email},\n\nA tester has signed the MISMO Link AI User Agreement:\n\n${who}\n\nSigned ${when} (${ref}).\n\nPlease set them up and send their instructions and credentials within 3 business days, by ${due}. Mark them Set Up in Testers and Access when done:\n${AGR_HQ}`
      : `Hello ${x.name || email},\n\n${s.organization} has signed the MISMO Link AI SaaS Subscriber Agreement:\n\n${who}\n\nSigned ${when} (${ref}).\n\nNext steps, by ${due} (3 business days):\n1. Schedule the kick-off call.\n2. Send them the User Agreement link for each person taking part in the beta: ${AGR_PAGES.user}\n\nTesters and Access has the company's people and Member 360 contacts, and a draft email for the User Agreement link:\n${AGR_HQ}`;
    const subject = s.kind === 'user' ? `User Agreement signed: ${s.signerName}, ${s.organization}` : `Subscriber Agreement signed: ${s.organization} - schedule the kick-off`;
    await sendMail({ kind: 'agreement-alert', to: email, subject, text: t, html: htmlOf(t) }).catch(e => console.warn('agreement alert:', e && e.message));
  }
  return respond(200, { ok: true, reference: ref, followUpBy });
}
