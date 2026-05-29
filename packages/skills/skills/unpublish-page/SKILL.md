---
name: agntcms-unpublish-page
user-invocable: true
description: Takes a published page offline (removes it from the live site) while preserving its content as a draft and keeping full history. Non-destructive — the page can be republished at any time.
---

# agntcms Unpublish Page

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full unpublish flow: slug resolution, existence check, confirmation gate, endpoint
call, and how to restore the page afterwards.

---

## When to use this skill

Use this skill when:
- The editor wants to take a page offline temporarily (e.g. "unpublish the about page",
  "take the about page offline", "hide the services page from the site").

Do NOT use this skill:
- When the editor wants to remove a page permanently — use `agntcms-delete-page` instead.
  Unpublish is "take offline but keep editable". Delete is "remove entirely".
- If the editor's intent is ambiguous (e.g. "can you deal with the about page?"). Clarify
  before acting.

---

## Unpublish vs. delete — choose the right operation

| | Unpublish | Delete |
|---|---|---|
| Live URL after operation | 404 | 404 |
| Content in `content/pages/` | Removed | Removed |
| Content in `content/drafts/` | Preserved (promoted from published if no draft existed) | Removed |
| History in `content/history/` | Preserved | Preserved |
| Can be reversed | Yes — publish the draft | Only via history (rollback) |

When in doubt about the editor's intent, ask: "Do you want to take the page offline temporarily
(unpublish, content kept as a draft) or remove it entirely (delete)?"

---

## Step 1: Resolve the slug

Extract the target slug from the editor's message:
- Lowercase, alphanumeric + hyphens only.
- Derive from the page name if obvious; ask if ambiguous.

---

## Step 2: Verify the page exists

Check the local filesystem before calling any endpoint:

- If `content/pages/<slug>.json` does NOT exist → stop and tell the editor:

  ```
  The page '<slug>' is not currently published — nothing to unpublish.
  ```

  Also check `content/drafts/<slug>.json`. If only a draft exists, inform the editor:
  "There is a draft for '<slug>' but it is not published — it is already in draft state."

- If `content/pages/<slug>.json` exists → continue to Step 3.

---

## Step 3: Require explicit confirmation

Unpublish takes the page offline immediately. Before calling the endpoint, the editor's message
must contain a clear expression of intent.

Accepted signals:
- The word **unpublish**, **take offline**, **hide**, or **yes** (in response to a confirmation question).

If the editor's original message already contained an explicit signal (e.g. "unpublish the about
page"), the intent is already confirmed — do not ask again.

If the intent is ambiguous, ask:

```
Are you sure you want to unpublish '<slug>'? The live URL will return 404, but the content will
be preserved as a draft and can be republished at any time.
Reply with "yes" or "unpublish" to confirm.
```

Wait for the reply before proceeding.

---

## Step 4: Call the unpublish endpoint

```
POST http://localhost:3000/api/agntcms/page/unpublish
Content-Type: application/json

{"slug": "<slug>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/page/unpublish \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>"}'
```

The endpoint:
1. Removes `content/pages/<slug>.json` (the live published file).
2. If `content/drafts/<slug>.json` did not already exist, promotes the published content to a
   draft so the content is not lost.
3. Preserves `content/history/<slug>/` — all previous version snapshots remain intact.
4. Commits the change to git.

---

## Step 5: Interpret the response and report

**Success** — HTTP 200, body `{"ok": true}`:
- The page is no longer live. `/<slug>` now returns 404.
- The content is preserved as a draft at `content/drafts/<slug>.json`.
- History is intact at `content/history/<slug>/`.
- Report to the editor:

  ```
  Done. The '<slug>' page has been unpublished and is no longer live.
  The content is preserved as a draft — you can republish it at any time by publishing the draft.
  ```

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- The page was NOT changed. `content/pages/<slug>.json` is unchanged.
- Report the error exactly as received:

  ```
  Error: unpublish failed for '<slug>' — <error message from response>
  The page has not been changed.
  ```

- Do not retry without the editor's instruction.

---

## How to restore (republish) an unpublished page

After unpublishing, the content lives in `content/drafts/<slug>.json`. To bring the page back
online, load `agntcms-publish-draft` and follow its steps:

```
POST http://localhost:3000/api/agntcms/draft/publish
Content-Type: application/json

{"slug": "<slug>"}
```

If the editor wants to restore to an older version instead, load `agntcms-rollback` — the full
history at `content/history/<slug>/` is preserved across unpublish.

---

## Key rules

1. **Never delete files directly.** Only the `page/unpublish` endpoint removes the published
   file and promotes to draft. Direct file operations bypass the git commit and may leave
   `content/pages/` and `content/drafts/` out of sync.
2. **Confirmation is mandatory.** The page goes offline immediately. Do not call the endpoint
   without an explicit confirmation signal from the editor.
3. **Content is not lost.** Unlike delete, unpublish always preserves content. Make this clear
   to editors who are hesitant — unpublish is fully reversible.
4. **History is preserved.** All snapshots in `content/history/<slug>/` remain available for
   rollback after unpublish.
5. **Do not double-commit.** The endpoint makes the git commit. Do not run `git add` or
   `git commit` after a successful unpublish.
