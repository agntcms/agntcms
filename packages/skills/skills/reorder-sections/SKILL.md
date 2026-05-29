---
name: agntcms-reorder-sections
user-invocable: true
description: Reorders sections within a draft page via the framework endpoint. Handles section disambiguation by type, position, or ID. Never edits JSON files manually.
---

# agntcms Reorder Sections

Load the `agntcms-structure` and `agntcms-content-fs` skills before this one. This skill
covers the full reorder flow: reading the current section list, resolving the editor's
requested order, confirming it, calling the reorder endpoint, and reporting the outcome.

---

## When to use this skill

Use this skill when:
- The editor asks to change the order of sections on a page (e.g. "reorder sections on about: hero first, then text block", "move the hero section to the top", "put the CTA last").

Do NOT use this skill:
- To add or remove sections — use the inline editor for that.
- To edit section content — use the inline editor.
- To reorder sections by editing `content/drafts/<slug>.json` or `content/pages/<slug>.json`
  directly. The endpoint validates and writes the file. Manual edits can corrupt section IDs.

---

## Step 1: Read the current section list

Read the page's current sections. Prefer the draft if it exists; fall back to the published page.

```bash
# Check for a draft first
cat content/drafts/<slug>.json

# If no draft exists, read the published page
cat content/pages/<slug>.json
```

Extract the `sections` array. Each section has at minimum an `id` field and a `type` field.
Example:

```json
{
  "sections": [
    {"id": "s1", "type": "Hero", "content": {"headline": "Welcome"}},
    {"id": "s2", "type": "TextBlock", "content": {"body": "..."}},
    {"id": "s3", "type": "TextBlock", "content": {"body": "..."}}
  ]
}
```

If the file does not exist, stop:

```
No draft or published page found for '<slug>'. Cannot reorder sections.
```

If `sections` is empty or has only one entry, stop:

```
The page '<slug>' has fewer than two sections — there is nothing to reorder.
```

---

## Step 2: Show the current section list to the editor

Always display the current order before building the new one. This is the most common source
of mistakes — the editor needs to see what they are working with.

```
Current sections on '<slug>':
  1. Hero (id: s1)
  2. TextBlock (id: s2)
  3. TextBlock (id: s3)

How should I reorder them?
```

If the editor's original request was specific enough (e.g. "hero first, then text block"),
you can skip the question but still show the list as confirmation before calling the endpoint.

---

## Step 3: Resolve the new order

Build the `order` array — a permutation of all section IDs. The order array must contain
**every** section ID exactly once.

### Protocol for referencing sections

Sections can be referenced in several ways. Apply them in priority order:

**By position** — always unambiguous:
- "first", "1st", "top" → the section currently at index 0
- "second", "2nd" → index 1
- "last", "bottom" → the last section

**By type name** — unambiguous only when exactly one section of that type exists:
- "Hero", "TextBlock", "CTA" → the section whose `type` matches (case-insensitive)
- If two or more sections share the same type, this reference is ambiguous — see below

**By ID** — always unambiguous, but editors rarely know IDs:
- Match against the `id` field directly

### Handling ambiguity

If the editor's description is ambiguous (e.g. "move TextBlock to the top" when two
TextBlock sections exist), ask for clarification by position:

```
There are two TextBlock sections:
  2. TextBlock (id: s2)
  3. TextBlock (id: s3)

Which one should go to the top? (say "the second one" or "the third one" to clarify)
```

Do not guess. Wait for the editor to confirm before proceeding.

---

## Step 4: Confirm the new order

Show the resolved new order to the editor before calling the endpoint:

```
Here is the new order I will apply to '<slug>':
  1. Hero (id: s1)
  2. TextBlock (id: s3)
  3. TextBlock (id: s2)

Shall I apply this? (yes / no)
```

If the editor's original request was unambiguous and specific enough, one confirmation
pass is sufficient — do not ask for confirmation again after the editor already said "yes".

---

## Step 5: Call the reorder endpoint

```
POST http://localhost:3000/api/agntcms/draft/reorder
Content-Type: application/json

{"slug": "<slug>", "order": ["id1", "id2", "id3"]}
```

Example with curl:

```bash
curl -s -X POST http://localhost:3000/api/agntcms/draft/reorder \
  -H "Content-Type: application/json" \
  -d '{"slug":"<slug>","order":["s1","s3","s2"]}'
```

The endpoint:
1. Validates that `order` is a permutation of the current section IDs (no extras, no missing).
2. Rewrites `content/drafts/<slug>.json` with sections in the new order.
3. Does NOT auto-publish — the editor still needs to publish when ready.

---

## Step 6: Interpret the response

**Success** — HTTP 200, body `{"ok": true}`:
- The draft at `content/drafts/<slug>.json` now has sections in the requested order.
- Continue to Step 7 to get a preview URL.

**Failure** — any non-200 status or `{"ok": false, "error": "..."}`:
- The draft was NOT changed.
- Report the error exactly as received.
- Do not retry without the editor's instruction.

---

## Step 7: Get a preview URL

After a successful reorder, call the preview issue endpoint so the editor can verify the result:

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
- The reorder was still successful. Report the operation success and note that the preview URL
  could not be obtained.

---

## Step 8: Report to the editor

```
Sections reordered. Preview the result:
http://localhost:3000/api/agntcms/preview/enter?token=<token>
```

If preview issue failed:

```
Sections reordered on '<slug>'.
(Could not obtain a preview URL — try asking me for a preview of '<slug>' later.)
```

---

## Error path

If the page does not exist:

```
No draft or published page found for '<slug>'. Cannot reorder sections.
```

If sections array is too short:

```
The page '<slug>' has fewer than two sections — there is nothing to reorder.
```

If the editor's description is ambiguous:

```
There are multiple '<type>' sections on '<slug>'. Please clarify by position
(e.g. "the first TextBlock" or "the second TextBlock").
```

If the order array would be missing or duplicate IDs (this should be caught before calling the
endpoint, but also handle the endpoint error):

```
Error: reorder failed for '<slug>' — <error message from response>
The draft was not changed.
```

---

## Key rules

1. **Never edit JSON files manually.** Only the reorder endpoint writes the draft with the new
   section order. Manual edits can corrupt section IDs or produce invalid JSON.
2. **The order array is a full permutation.** It must contain ALL section IDs — no extras, no
   omissions. A partial reorder is not supported. Build the full array before calling the endpoint.
3. **Always show the current list first.** The editor needs to see the current state to give a
   meaningful reorder instruction. Do not skip Step 2.
4. **Disambiguate before acting.** If two sections share the same type and the editor referenced
   them by type, ask which one they mean. Do not guess.
5. **Reorder targets the draft.** The endpoint writes to `content/drafts/<slug>.json`. The
   live page is not affected until the editor publishes.
6. **One page at a time.** Handle reorder requests sequentially if the editor asks for multiple
   pages.
