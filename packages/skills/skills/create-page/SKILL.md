---
name: agntcms-create-page
user-invocable: true
description: Creates an empty page draft and returns a preview URL so the editor can start building the page through inline editing.
---

# agntcms Create Page

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full create-page flow: slug validation, duplicate detection, draft creation, and
preview URL delivery.

---

## When to use this skill

Use this skill when:
- The editor asks to create a new page (e.g. "create a page about us", "add a contact page").

Do NOT use this skill:
- To edit an existing page's content — that is inline editing via the preview URL.
- To publish a page — use `agntcms-publish-draft` for that.
- To create a file manually at `content/drafts/`. The endpoint owns draft creation.

---

## Step 1: Derive and validate the slug

Extract a slug from the editor's request. Rules:
- Lowercase only.
- Alphanumeric characters and hyphens only (`[a-z0-9-]`).
- No leading or trailing hyphens.

Examples:
- "about us" → `about-us`
- "home page" → `home`
- "404 page" → `404`
- "our team page" → `our-team`, or ask the editor for a preferred slug if it cannot be derived

If the slug cannot be derived unambiguously, ask the editor to confirm the slug before
proceeding.

Reserved system-page rule:
- The canonical editable 404 page slug is `404`.
- The canonical editable 500 page slug is `500`.
- Never create aliases like `error-404`, `not-found`, `_not-found`, `404-page`, `error-500`,
  `500-page`, or `server-error`.
- If the editor asks for a 404 page and proposes an alias, normalize it to `404` and say so
  explicitly before continuing.

---

## Step 2: Check for existing content

Before calling any endpoint, check the local filesystem:

1. If `content/pages/<slug>.json` exists → the page is already published. Stop and tell the
   editor: the page already exists at that slug. Do not proceed.

2. If `content/drafts/<slug>.json` exists → a draft already exists. Tell the editor and offer
   two options:
   - Use the existing draft (skip creation, jump to Step 4 to get a preview URL).
   - Overwrite the draft (proceed with creation, which will replace the existing draft).

   Wait for the editor to choose before continuing.

---

## Step 3: Collect SEO metadata

Before creating the draft, collect or derive `seo.title` and `seo.description`. Both are
**required** — a page without them is invalid (`Page.seo` is non-optional as of the basic-SEO
guarantee shipped with the framework).

Ask the editor for the SEO title and description if they have not provided them.
If the editor says "just create it" without specifying, derive reasonable defaults:
- `seo.title`: a plain-text version of the page name (e.g. slug `about-us` → "About us").
  `seo.title` is the literal `<title>` element — include the brand name if you want it
  in the tab/search result, omit it if the title already implies the page identity.
- `seo.description`: a one-sentence placeholder such as "Coming soon." or
  "About the [project name] team." — the editor can refine it later.

Never create a draft with `seo: { title: "", description: "" }`. Partially populated SEO
(e.g. title but no description) is also invalid. Both fields must be non-empty strings.

---

## Step 4: Create the draft

Call the save endpoint to create a minimal draft with populated SEO:

```
POST http://localhost:3000/api/agntcms/draft/save
Content-Type: application/json

{"slug": "<slug>", "seo": {"title": "<title>", "description": "<description>"}, "sections": []}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/draft/save \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>","seo":{"title":"<title>","description":"<description>"},"sections":[]}'
```

**Success** — HTTP 200, body `{"ok": true}`:
- The draft file has been created at `content/drafts/<slug>.json`.
- Continue to Step 5.

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- Report the error exactly as received.
- Do not proceed to Step 5.

---

## Step 5: Get a preview URL

Call the preview issue endpoint to obtain a time-limited preview token:

```
POST http://localhost:3000/api/agntcms/preview/issue
Content-Type: application/json

{"slug": "<slug>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/preview/issue \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>"}'
```

Response shape:

```json
{"token": "...", "previewUrl": "/api/agntcms/preview/enter?token=..."}
```

Construct the full URL by prepending the base URL:

```
http://localhost:3000<previewUrl>
```

If the Next.js dev server is running on a different port or hostname (check the environment),
use that base URL instead.

**Failure** — any non-200 status or error body:
- Report the error. The draft was created in Step 4 and is safe. Tell the editor they can
  try getting a preview URL again later.

---

## Step 6: Report to the editor

Send the preview URL to the editor:

```
Page created. Open it here to start editing:
http://localhost:3000/api/agntcms/preview/enter?token=<token>
```

The editor clicks this link to open the page in preview mode and can add sections through
the inline editing interface.

---

## Error path

If the page already exists (published):

```
The page '<slug>' already exists and is published at content/pages/<slug>.json.
To edit it, create a new draft from the UI or ask me to open a preview of the current content.
```

If slug validation fails:

```
I need a valid slug to create the page. Slugs must be lowercase with hyphens only (e.g. "about-us").
What slug should I use?
```

If the requested slug is a reserved alias:

```
Use the canonical "404" page instead of creating "<slug>".
Open or edit the existing 404 page at slug "404".
```

If draft creation fails:

```
Error: could not create draft for '<slug>' — <error message from response>
```

If preview issue fails (after successful draft creation):

```
The draft was created at content/drafts/<slug>.json, but I could not get a preview URL.
Error: <error message from response>
You can try again by asking me for a preview of '<slug>'.
```

---

## Key rules

1. **Never write draft files manually.** Only the `draft/save` endpoint creates or overwrites
   a draft. Manual writes bypass validation and could produce malformed JSON.
2. **Always deliver a preview URL.** The preview URL is the editor's only entry point to the
   new page. Do not skip Step 5 even if the editor does not explicitly ask for it.
3. **Check before creating.** The local filesystem check in Step 2 prevents accidental
   overwrites and gives a faster, clearer response than waiting for an endpoint error.
4. **One slug at a time.** If the editor wants multiple pages, handle them sequentially.
5. **Ask rather than guess.** If the slug is ambiguous, ask. A wrong slug is hard to change
   after the editor has started building the page.
6. **SEO is mandatory.** Always include `seo.title` and `seo.description` in the draft
   payload. A page without both is invalid — the FS adapter will store it, but the runtime
   type contract (`Page.seo` is required) is violated. Never create a page without SEO.
7. **Use canonical system-page slugs.** Edit `404` for the real not-found page and `500` for
   the real server-error page. Do not invent aliases like `error-404`.
