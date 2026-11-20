# Relay request 12: MISMO Link Help Desk form (Jonna, 20 Nov 2026)

**For Perry.** One new public route on the save relay, built exactly like the agreements route
(relay request 11). Nothing else on the relay changes, and no new AWS settings or environment
variables are needed. It sends **no email**.

## What it does

`POST /mismo-link/helpdesk/submit`, no sign-in, from `resources.mismo.org` only.

The public help form at `resources.mismo.org/mismo-link/help/` already calls it. It replaces the
Smartsheet "MISMO Link Help Desk Support Ticket" form.

For each request it:

1. Adds a ticket to `data/helpdesk.json` in the **private** `GitMISMO/mismo-link-data` repo as
   `tickets/MLHD-00054` and so on, numbered after the highest ticket already there (the old Smartsheet
   tickets were brought in with their own numbers). MISMO Link HQ → Help Desk already reads that file.
2. If they attached a screenshot (an image or PDF, 3 MB at most), keeps it in its own file,
   `data/hdfile00054.json`, and lists it on the ticket. If that save fails, the ticket is still kept
   and a note on it says to ask for the file.
3. Returns the ticket number, which the form shows on screen.

It emails no one. Jonna's rule is that nothing is sent without a person sending it: Kellie sees new
tickets in the Help Desk and replies from Outlook.

Misuse checks are the same as for ideas and agreements:

- the Origin must be the site
- the hidden field must be empty
- at least 3 seconds between opening the page and sending
- 5 an hour per address, 60 an hour in all
- 4.5 MB at most (the screenshot is most of that); every field checked

Until the route is live, the form gets a 404 and falls back to opening the person's own email
program with their request addressed to linksupport@mismo.org, so nothing is lost in the meantime.

## The change

The base is the relay's current `initiative-hub` `_dev/aws/index.mjs` (request 11 already in it).

1. Paste `helpdesk-route.mjs` into `index.mjs`, just above the `MISMO LINK AI BETA AGREEMENTS` block.
2. Add this dispatch line directly above the `/agreements/submit` one:

```js
if (method === 'POST' && subPath === '/helpdesk/submit') { /* relay request 12: the MISMO Link help form, no sign-in */
  if (!proj || proj.key !== HD_PROJECT) return respond(404, { error: 'NOT_FOUND' });
  return helpdeskSubmit(event, proj, headers);
}
```

3. Check the Lambda's request size: a screenshot makes the body up to about 4.5 MB. Function URLs take
   6 MB, so the default is fine unless the relay caps bodies lower itself.
4. Add `test-helpdesk.mjs` to `_dev/aws/` next to it. `node test-helpdesk.mjs` runs 17 checks on the route
   on its own (stand-ins for `respond`, `parseBody` and `updateRepoJson`), all passing.
5. Deploy as usual.

## Already in place

- `mismo-link` in `_internal/projects.json` → `GitMISMO/mismo-link-data`, writable `data/`
- `data/helpdesk.json` is created by the first ticket (`updateRepoJson` starts from `{}` as it did for
  `data/signatures.json`)

## The email side (linksupport@mismo.org), for Jonna

This works like 360@ for Member 360 and needs no relay change:

1. **IT:** linksupport@mismo.org needs to be a shared mailbox (as 360@mba.org is, with the mismo.org
   alias), with Jonna given access.
2. **Power Automate:** save a copy of the Member 360 mail-in flow, point its trigger at the
   linksupport shared mailbox, and point its save at project `mismo-link`, doc `mailin` instead of
   `member-360`. Same shape: `{docs:{<id>:{from, to, cc, subject, received, html, mid, at, src}}}`.
3. MISMO Link HQ reads `data/mailin` when Kellie or Jonna opens it: an email with a ticket number
   (`MLHD-00054`) in the subject, or a reply in the same thread, is added to that ticket; anything else
   from outside MISMO opens a new ticket. It then blanks the HTML and marks the email done.
