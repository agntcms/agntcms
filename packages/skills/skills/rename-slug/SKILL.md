---
name: agntcms-rename-slug
user-invocable: true
description: Atomically renames a page slug via the framework endpoint. Handles pages, drafts, and history in one operation. Never renames files manually.
---

# agntcms Rename Slug

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full slug-rename flow: validating both slugs, checking for conflicts, calling the
rename endpoint, and warning the editor about broken external links.

---

## When to use this skill

Use this skill when:
- The editor asks to rename or move a page slug (e.g. "rename about to about-us",
  "rename the home page to main", "change the slug of services to our-services").

Do NOT use this skill:
- To rename section component folders — slugs are page-level identifiers, not component names.
- To rename files at `content/pages/`, `content/drafts/`, or `content/history/` directly.
  The endpoint owns all three directories atomically. Manual renames will leave them out of sync.

---

## Step 1: Extract and validate both slugs

Parse the source slug (`fromSlug`) and target slug (`toSlug`) from the editor's request.

Slug validation rules (apply to `toSlug`):
- Lowercase only.
- Alphanumeric characters and hyphens only (`[a-z0-9-]`).
- No leading or trailing hyphens.
- No double hyphens.

If `toSlug` does not pass validation, stop:

```
'<toSlug>' is not a valid slug. Slugs must be lowercase with hyphens only (e.g. "about-us").
What slug should I use?
```

Reserved system-page rule:
- The real editable 404 page lives at slug `404`.
- The real editable 500 page lives at slug `500`.
- Do not rename pages to aliases like `error-404`, `not-found`, `_not-found`, `404-page`,
  `error-500`, `500-page`, or `server-error`.
- If the editor wants the 404 page, rename or edit the canonical `404` page only.

---

## Step 2: Verify source exists

Check that the source page exists locally:

- `content/pages/<fromSlug>.json` must exist.

If neither exists, stop:

```
No page found for slug '<fromSlug>' — nothing to rename.
```

---

## Step 3: Verify target does not exist

Check that the target slug is not already taken:

- `content/pages/<toSlug>.json` must NOT exist.
- `content/drafts/<toSlug>.json` must NOT exist.

If either exists, stop:

```
A page or draft already exists at slug '<toSlug>'. Choose a different slug.
```

---

## Step 4: Call the rename endpoint

```
POST http://localhost:3000/api/agntcms/page/rename
Content-Type: application/json

{"fromSlug": "<fromSlug>", "toSlug": "<toSlug>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/page/rename \
  -H "Content-Type: application/json" \
  -d '{"fromSlug":"<fromSlug>","toSlug":"<toSlug>"}'
```

The endpoint atomically:
1. Renames `content/pages/<fromSlug>.json` → `content/pages/<toSlug>.json` (if it exists).
2. Renames `content/drafts/<fromSlug>.json` → `content/drafts/<toSlug>.json` (if it exists).
3. Renames `content/history/<fromSlug>/` → `content/history/<toSlug>/` (if it exists).
4. Commits the change to git with the message `agntcms: rename <fromSlug> to <toSlug>`.

---

## Step 5: Interpret the response

**Success** — HTTP 200, body `{"ok": true}`:
- The page is now accessible at the new slug.
- Continue to Step 6 to get a preview URL.
- Do not run `git add` or `git commit` — the endpoint already committed.

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- Nothing was renamed. All files are in their original locations.
- Report the error exactly as received.
- Do not retry without the editor's instruction.

---

## Step 6: Get a preview URL

After a successful rename, call the preview issue endpoint using the new slug:

```
POST http://localhost:3000/api/agntcms/preview/issue
Content-Type: application/json

{"slug": "<toSlug>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/preview/issue \
  -H "Content-Type: application/json" \
  -d '{"slug":"<toSlug>"}'
```

Response shape:

```json
{"token": "...", "previewUrl": "/api/agntcms/preview/enter?token=..."}
```

**Failure** — any non-200 status or error body:
- The rename was still successful. Report the operation success and note that the preview URL
  could not be obtained.

---

## Step 7: Warn about broken external links and report

After a successful rename, always include the SEO/link warning alongside the preview URL:

```
Page renamed from '<fromSlug>' to '<toSlug>'. View it here:
http://localhost:3000/api/agntcms/preview/enter?token=<token>

Note: The old URL /<fromSlug> will now return 404. Any external links, bookmarks,
or references to that URL will break. If this page was indexed by search engines,
consider adding a redirect from /<fromSlug> to /<toSlug> in your Next.js config.
```

If preview issue failed:

```
Page renamed from '<fromSlug>' to '<toSlug>' successfully.
(Could not obtain a preview URL — try asking me for a preview of '<toSlug>' later.)

Note: The old URL /<fromSlug> will now return 404. Any external links, bookmarks,
or references to that URL will break. If this page was indexed by search engines,
consider adding a redirect from /<fromSlug> to /<toSlug> in your Next.js config.
```

---

## Error path

If `fromSlug` does not exist locally:

```
No page found for slug '<fromSlug>' — nothing to rename.
```

If `toSlug` is invalid:

```
'<toSlug>' is not a valid slug. Slugs must be lowercase with hyphens only (e.g. "about-us").
What slug should I use?
```

If `toSlug` is a reserved alias:

```
'<toSlug>' is a reserved alias for a system page. Use the canonical slug '404' or '500'
instead, depending on which error page you want to edit.
```

If `toSlug` is already taken:

```
A page or draft already exists at slug '<toSlug>'. Choose a different slug.
```

If the endpoint returns an error:

```
Error: rename failed ('<fromSlug>' → '<toSlug>') — <error message from response>
All files remain at their original locations.
```

---

## Key rules

1. **Never rename files manually.** Only the rename endpoint touches `content/pages/`,
   `content/drafts/`, and `content/history/`. Manual renames leave directories out of sync
   and skip the git commit.
2. **Check locally first.** The local filesystem checks in Steps 2 and 3 are faster and give
   clearer errors than waiting for an endpoint response.
3. **Always warn about broken links.** A slug rename breaks every existing URL. The editor
   must know before they proceed, not after.
4. **Do not double-commit.** The endpoint makes the git commit. Do not run `git add` or
   `git commit` after a successful rename.
5. **One rename at a time.** If the editor wants to rename multiple pages, handle them
   sequentially so each can be confirmed individually.
6. **Keep system pages canonical.** The actual Next.js not-found page is backed by slug `404`;
   do not invent or target alias slugs like `error-404`.
