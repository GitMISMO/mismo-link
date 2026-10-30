# Relay request 11: MISMO Link AI beta agreements (Jonna, 30 Oct 2026)

**For Perry.** One new public route on the save relay, built exactly like the ideas
route (relay request 10). Nothing else on the relay changes, and no new AWS settings or
environment variables are needed. It uses the existing `MAIL_FLOW_URL`.

## What it does

`POST /mismo-link/agreements/submit`, no sign-in, from `resources.mismo.org` only.

The two public signing pages already call it:

- `resources.mismo.org/mismo-link/sign/`: the company's SaaS Subscriber Agreement
- `resources.mismo.org/mismo-link/user/`: each tester's User SaaS Agreement

For each signature it does three things:

1. Adds the signature to `data/signatures.json` in the **private** `GitMISMO/mismo-link-data`
   repo as `signatures/SIG-0001`, and so on. MISMO Link HQ already reads that file.
2. Emails the signer a copy: the agreement, the version, the time and the reference, plus the
   next step. It repeats nothing they typed.
3. Emails the beta team, using the list in `data/settings.json` of the same repo
   (`{"notify":[{"name","email"}]}`). That list is edited in MISMO Link HQ → Beta Agreement →
   Who Is Told, and today it holds Kellie Stoll. The email depends on the agreement:
   - **Subscriber signed** → "schedule the kick-off call and send the User Agreement link,
     by <3 business days>"
   - **User signed** → "set this person up with instructions and credentials, by <3 business days>"
   - If the list is empty, MISMO Link administrators are told instead.

Misuse checks are the same as for ideas:

- the Origin must be the site
- the hidden field must be empty
- at least 3 seconds between opening the page and signing
- 5 an hour per address, 40 an hour in all
- 32 kB at most

It also checks that:

- the typed signature matches the signer's name
- the agreement was read to the end
- the agreement is one of the two known titles

The signer's IP is stored with the signature as part of the e-sign record.

Until the route is live, the pages get a 404 and fall back to saving a file for the signer
to email to info@mismo.org, so nothing is lost in the meantime.

## The change

The base is `initiative-hub` `_dev/aws/index.mjs` at commit `8329804` (29 Oct 2026).

1. Paste `agreements-route.mjs` into `index.mjs`, just above the
   `IDEAS FROM THE PUBLIC FORM` comment block.
2. Add this dispatch line directly above the `/ideas/submit` one:

   ```js
   if (method === 'POST' && subPath === '/agreements/submit') {   /* relay request 11: the MISMO Link AI beta signing pages, no sign-in */
     if (!proj || proj.key !== AGR_PROJECT) return respond(404, { error: 'NOT_FOUND' });
     return agreementSubmit(event, proj, headers);
   }
   ```

`index.mjs` in this folder is that base with both edits already made. If the relay has not
changed since 8329804, you can use it as-is.

3. Add `test-agreements.mjs` to `_dev/aws/`. Running `node test-agreements.mjs` gives 24 checks,
   all passing. `test-ideas.mjs` and `test-relay.mjs` still pass against the patched file.
4. Deploy as usual.

## Already in place

- `mismo-link` in `_internal/projects.json` → `GitMISMO/mismo-link-data`, writable `data/`
- `data/partners.json`, `data/settings.json` (Kellie) and `data/progress.json`, already being
  read and written through the relay from MISMO Link HQ

## Please check

- **The token.** Writes to `mismo-link-data` already work, so it is granted.
- **Kellie's address.** It is set as `kstoll@mismo.org`. Change it under Who Is Told if that
  is wrong.
- **Kellie's access.** She needs **Edit** on MISMO Link in People & Access, so she can add and
  remove people, mark kick-offs and mark testers set up.
