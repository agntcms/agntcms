---
name: agntcms-publish-draft
user-invocable: true
description: Publishes a draft by calling the framework's publish endpoint. Never moves files manually — the endpoint owns the draft→published promotion and the git commit.
---

# agntcms Publish Draft

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the single operation of publishing a draft page: verifying the draft exists, calling
the publish endpoint, and reporting the outcome.

---

## When to use this skill

Use this skill when:
- The user explicitly asks the agent to publish a page (e.g. "publish the home page draft").

Do NOT use this skill:
- For routine draft editing — write the draft and let the user publish from the UI.
- To move files between `content/drafts/` and `content/pages/` directly. The endpoint owns
  that operation. Manual file movement bypasses the git commit and version history.

---

## Step 1: Verify the draft exists

Check that `content/drafts/<slug>.json` exists using native file tools before calling the
endpoint. This gives a clear local error if the file is missing, without burning an HTTP
round-trip.

If the file does not exist, stop and report the error (see Error path below). There is
nothing to publish.

---

## Step 2: Call the publish endpoint

```
POST http://localhost:3000/api/agntcms/draft/publish
Content-Type: application/json

{"slug": "<slug>"}
```

The endpoint:
1. Moves `content/drafts/<slug>.json` to `content/pages/<slug>.json`.
2. Writes a versioned snapshot to `content/history/<slug>/<timestamp>.json`.
3. Commits the change to git with the message `agntcms: publish <slug>`.

Use a native HTTP tool (e.g. `curl` or a fetch-capable script). Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/draft/publish \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>"}'
```

---

## Step 3: Interpret the response

**Success** — HTTP 200, body `{"ok": true}`:
- The draft is now live at `content/pages/<slug>.json`.
- A git commit was made by the runtime.
- Continue to Step 4 to get a preview URL.

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- The draft was NOT moved. The file at `content/drafts/<slug>.json` is unchanged.
- Report the error exactly as received from the endpoint.
- Do not retry without the user's instruction.

---

## Step 4: Get a preview URL

After a successful publish, call the preview issue endpoint so the editor can verify the live result:

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
- The publish was still successful. Report the operation success and note that the preview URL
  could not be obtained.

---

## Step 5: Report to the editor

Report both the live URL and the preview URL:

```
Published. View the live page:
http://localhost:3000/<slug>

To continue editing in preview mode:
http://localhost:3000/api/agntcms/preview/enter?token=<token>
```

If preview issue failed:

```
Published. The page is now live at:
http://localhost:3000/<slug>

(Could not obtain a preview URL — try asking me for a preview of '<slug>' later.)
```


---

## Error path

If the draft file does not exist locally:

```
Error: draft not found at content/drafts/<slug>.json — nothing to publish
```

If the endpoint returns an error:

```
Error: publish failed for '<slug>' — <error message from response>
```

Always report these back to the user. Never leave an operation unacknowledged.

---

## Key rules

1. **Never move files manually.** Only the publish endpoint moves files from `content/drafts/`
   to `content/pages/`. Manual moves skip the git commit and version history.
2. **Verify locally first.** Check the draft file exists before calling the endpoint. A local
   check is faster and gives a clearer error message.
3. **Do not double-commit.** The endpoint makes the git commit. Do not run `git add` or
   `git commit` after a successful publish — this would create a redundant second commit.
4. **One slug at a time.** The endpoint accepts a single slug per request. If the user wants
   to publish multiple pages, call the endpoint once per slug.
5. **Report outcome clearly.** Whether success or failure, the user needs to know what happened
   and the current state of the content files.
