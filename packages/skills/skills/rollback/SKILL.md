---
name: agntcms-rollback
user-invocable: true
description: Rolls a published page or global back to a previous version snapshot via the framework endpoint. Never copies history files manually.
---

# agntcms Rollback

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full rollback flow for both pages and globals: fetching the version history, confirming
the target snapshot with the editor, calling the rollback endpoint, and reporting the outcome.

---

## When to use this skill

Use this skill when:
- The editor asks to revert a page to an earlier state (e.g. "revert about to the previous version",
  "undo the last change to the home page", "restore the about page from yesterday").
- The editor asks to revert a global to an earlier state (e.g. "restore the header to yesterday's
  version", "undo the last change to new-global").

Do NOT use this skill:
- To undo a single section change while keeping other sections — that requires editing the draft.
- To move or copy files between `content/history/` and `content/pages/` (pages) or
  `content/history-globals/` and `content/globals/` (globals) directly. The endpoint owns that
  operation. Manual copies bypass the git commit and version entry.

---

## Rollback for pages vs. globals

This skill handles both page rollback and global rollback. The workflows are identical except for
the endpoint paths and parameter names. Choose the correct branch based on what the editor asked
to revert.

| | Pages | Globals |
|---|---|---|
| History file location | `content/history/<slug>/` | `content/history-globals/<name>/` |
| Endpoint — history | `GET /api/agntcms/page/history?slug=<slug>` | `GET /api/agntcms/global/history?name=<name>` |
| Endpoint — rollback | `POST /api/agntcms/page/rollback` | `POST /api/agntcms/global/rollback` |
| Body field | `{"slug": "...", "timestamp": "..."}` | `{"name": "...", "timestamp": "..."}` |

The steps below describe the full flow; substitute `slug`/`name` and endpoint paths per the table.

---

## Step 1: Fetch the history list

**For a page**, call:

```
GET http://localhost:3000/api/agntcms/page/history?slug=<slug>
```

Example with curl:

```bash
curl -s "http://localhost:3000/api/agntcms/page/history?slug=<slug>"
```

**For a global**, call:

```
GET http://localhost:3000/api/agntcms/global/history?name=<name>
```

Example with curl:

```bash
curl -s "http://localhost:3000/api/agntcms/global/history?name=<name>"
```

Expected response shape:

```json
{"entries": [{"timestamp": "2024-01-15T10:30:00.000Z"}, {"timestamp": "2024-01-14T08:00:00.000Z"}]}
```

The `entries` array is sorted newest-first. Each entry carries a `timestamp` (ISO 8601).

**If `entries` is empty or the array has no items, stop:**

```
No version history found for '<slug or name>'. It cannot be rolled back.
```

**If the endpoint returns an error, stop and report it:**

```
Error: could not fetch history for '<slug or name>' — <error message from response>
```

---

## Step 2: Show the history list to the editor

Always display the available snapshots before rolling back, even if the editor said
"previous version" — confirmation prevents accidental data loss.

Format the list as a numbered menu. Convert timestamps to a human-readable local date/time
for readability:

```
Version history for '<slug or name>':
  1. 2024-01-15 10:30 (latest)
  2. 2024-01-14 08:00
  3. 2024-01-12 17:45

Which version should I restore? (or say "the previous one" to pick #1)
```

---

## Step 3: Resolve the target timestamp

Determine which snapshot to restore:

- **"Previous" or "last"** — use the most recent snapshot (index 0 in the `entries` array).
- **A date the editor mentioned** — match it to the closest timestamp in the list. If two
  snapshots are equally close, ask the editor to confirm which one.
- **A number from the menu** — use the corresponding snapshot directly.
- **Ambiguous** — ask the editor to confirm before proceeding.

---

## Step 4: Call the rollback endpoint

**For a page:**

```
POST http://localhost:3000/api/agntcms/page/rollback
Content-Type: application/json

{"slug": "<slug>", "timestamp": "<ISO timestamp>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/page/rollback \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>","timestamp":"<timestamp>"}'
```

The page endpoint:
1. Copies `content/history/<slug>/<timestamp>.json` to `content/pages/<slug>.json`.
2. Writes a new snapshot to `content/history/<slug>/<now>.json` (the rollback itself is a new version entry — it is not destructive).
3. Commits the change to git with the message `agntcms: rollback <slug> to <timestamp>`.

**For a global:**

```
POST http://localhost:3000/api/agntcms/global/rollback
Content-Type: application/json

{"name": "<name>", "timestamp": "<ISO timestamp>"}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/global/rollback \
  -H "Content-Type: application/json" \
  -d '{"name":"<name>","timestamp":"<timestamp>"}'
```

The global endpoint:
1. Copies `content/history-globals/<name>/<timestamp>.json` to `content/globals/<name>.json`.
2. Does not issue a git commit automatically — globals follow save-only semantics. If a commit is
   needed, use the `agntcms-git-publish` skill after confirming with the editor.

---

## Step 5: Interpret the response

**Success** — HTTP 200, body `{"ok": true}`:
- For a **page**: `content/pages/<slug>.json` now reflects the chosen snapshot. The rollback
  created a new history entry — the previous "latest" version is not lost. Continue to Step 6.
- For a **global**: `content/globals/<name>.json` now reflects the chosen snapshot. Skip to
  Step 7 (globals have no preview URL mechanism).

**Failure** — any non-200 status:
- The content was NOT changed.
- Report the error exactly as received.
- Do not retry without the editor's instruction.

---

## Step 6: Get a preview URL (pages only)

After a successful **page** rollback, call the preview issue endpoint so the editor can verify:

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

**Failure** — any non-200 status or error body:
- The rollback was still successful. Report the operation success and note that the preview URL
  could not be obtained.

For a **global** rollback, skip this step entirely.

---

## Step 7: Report to the editor

**After a page rollback:**

```
Rolled back to version <timestamp>. View the result:
http://localhost:3000/api/agntcms/preview/enter?token=<token>
```

If preview issue failed:

```
Rolled back to version <timestamp>.
(Could not obtain a preview URL — try asking me for a preview of '<slug>' later.)
```

**After a global rollback:**

```
Rolled back '<name>' to version <timestamp>.
The global is now live — no further action needed unless you want to commit this change.
```


---

## Error path

If history is empty:

```
No version history found for '<slug or name>'. It cannot be rolled back.
```

If the editor's chosen timestamp is not in the history list:

```
The timestamp '<timestamp>' was not found in the history for '<slug or name>'.
Available versions: <list them again>
```

If the endpoint returns an error:

```
Error: rollback failed for '<slug or name>' — <error message from response>
The content was not changed.
```

---

## Key rules

1. **Never copy history files manually.** Only the rollback endpoint promotes a history snapshot
   to the current published content. Manual copies skip the version entry (and for pages, the git
   commit too).
2. **Always show the history list first.** Even when the editor says "previous version", confirm
   which snapshot you are about to restore. Rollback affects live content.
3. **Page rollback is non-destructive.** The endpoint creates a new history snapshot — rolling back
   does not erase the version you are replacing. Communicate this to the editor so they are not
   afraid to undo a rollback.
4. **Do not double-commit after a page rollback.** The page endpoint makes the git commit. Do not
   run `git add` or `git commit` after a successful page rollback.
5. **Globals do not auto-commit on rollback.** After a successful global rollback, ask the editor
   whether to commit the change before using `agntcms-git-publish`.
6. **One item at a time.** If the editor wants to roll back multiple pages or globals, handle them
   sequentially, confirming each one individually.
