---
name: agntcms-delete-page
user-invocable: true
description: Deletes a published page via the framework endpoint after explicit editor confirmation. Never deletes files directly — history is preserved.
---

# agntcms Delete Page

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full delete-page flow: slug resolution, existence check, confirmation gate, and
endpoint call.

---

## When to use this skill

Use this skill when:
- The editor explicitly asks to delete a page (e.g. "delete the about page", "remove the services page").

Do NOT use this skill:
- When the editor wants to take a page offline temporarily while keeping it editable — use
  `agntcms-unpublish-page` instead. Unpublish preserves the content as a draft and is fully
  reversible. Delete removes the published file and draft permanently.
- If the editor's intent is ambiguous (e.g. "get rid of the content on about"). Clarify
  before acting.

---

## Step 1: Resolve the slug

Extract the target slug from the editor's message using the same rules as `agntcms-create-page`:
- Lowercase, alphanumeric + hyphens only.
- Derive from the page name if obvious; ask if ambiguous.

---

## Step 2: Verify the page exists

Check the local filesystem before calling any endpoint:

- If `content/pages/<slug>.json` does NOT exist → stop and tell the editor:

  ```
  The page '<slug>' does not exist in content/pages/. Nothing to delete.
  ```

  Also check `content/drafts/<slug>.json`. If a draft exists but no published page, inform
  the editor: "There is a draft for '<slug>' but no published page. Did you mean to delete the
  draft?" Wait for confirmation before taking any action.

- If `content/pages/<slug>.json` exists → continue to Step 3.

---

## Step 3: Require explicit confirmation

Deletion is irreversible at the file level (history is preserved — see Key rule 3, below).
Before calling the endpoint, the editor's message must contain a clear expression of intent.

Accepted signals:
- The word **delete**, **remove**, or **yes** (in response to a confirmation question).

If the editor's original message already contained an explicit signal (e.g. "delete the about
page"), the intent is already confirmed — do not ask again.

If the intent is ambiguous (e.g. "can you maybe remove the about page?"), ask:

```
Are you sure you want to delete the '<slug>' page? This will remove the published page.
Reply with "yes" or "delete" to confirm.
```

Wait for the reply before proceeding. If the editor replies with anything other than a clear
confirmation, stop and do not delete.

---

## Step 4: Call the delete endpoint

```
POST http://localhost:3000/api/agntcms/page/delete
Content-Type: application/json

{"slug": "<slug>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/page/delete \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>"}'
```

The endpoint:
1. Removes `content/pages/<slug>.json` and `content/drafts/<slug>.json` (if any).
2. Preserves `content/history/<slug>/` — previous version snapshots remain intact.
3. Commits the deletion to git.

---

## Step 5: Interpret the response and report

**Success** — HTTP 200, body `{"ok": true}`:
- The page has been removed from `content/pages/`.
- History is preserved in `content/history/<slug>/`.
- Report to the editor:

  ```
  Done. The '<slug>' page has been deleted.
  Its history is preserved in content/history/<slug>/ if you ever need to restore it.
  ```

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- The page was NOT deleted. The file at `content/pages/<slug>.json` is unchanged.
- Report the error exactly as received:

  ```
  Error: delete failed for '<slug>' — <error message from response>
  The page has not been changed.
  ```

- Do not retry without the editor's instruction.

---

## Key rules

1. **Never delete files directly.** Only the `page/delete` endpoint removes the page. Direct
   `rm` or file-tool deletion bypasses the git commit and history snapshot.
2. **Confirmation is mandatory.** Do not call the endpoint unless the editor's message
   contains an explicit confirmation signal. When in doubt, ask.
3. **History is preserved.** The endpoint writes a snapshot to `content/history/<slug>/`
   before deleting. Reassure the editor of this — it reduces hesitation and prevents
   accidental data loss from being permanent.
4. **Check existence first.** A local filesystem check before calling the endpoint gives a
   faster, clearer error and avoids a meaningless HTTP round-trip.
5. **Do not double-commit.** The endpoint makes the git commit. Do not run `git add` or
   `git commit` after a successful delete.
