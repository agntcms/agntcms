---
name: agntcms-content-fs
user-invocable: true
description: Explains how the agent edits content when the FS adapter is active — using native file tools to read and write JSON under content/drafts/ and content/pages/, never through MCP CRUD tools.
---

# agntcms Content Editing — FS Adapter

Load the `agntcms-structure` skill before this one. The layout described there is assumed here.

This skill applies when the project uses the default filesystem content adapter (the default in
`agntcms/config.ts` unless overridden). With this adapter, content lives as JSON files on
disk and you edit it with your native file tools.

---

## Directory layout

```
content/
├── pages/                  # published pages — served to site visitors
│   ├── home.json
│   ├── about.json
│   └── about/
│       └── team.json       # nested slug: "about/team"
│
├── drafts/                 # unpublished edits — not visible to visitors
│   └── home.json           # a draft exists when the page has unsaved changes
│
└── history/                # full-snapshot version archive — never delete these
    ├── home/
    │   ├── 1712345678000.json
    │   └── 1712399999000.json
    └── about/
        └── 1712300000000.json
```

Slugs can be nested. The slug `about/team` maps to the file path `content/pages/about/team.json`
(and `content/drafts/about/team.json` for its draft). The slug in the JSON `slug` field must
match the file path without the `.json` extension.

---

## Safe editing workflow

### Editing an existing page

1. Check whether a draft exists: look for `content/drafts/<slug>.json`.
   - If it exists: read the draft. It is the authoritative working copy — it may be ahead of
     the published version.
   - If it does not exist: read `content/pages/<slug>.json` as the starting point.
2. Make your changes to the in-memory content.
3. Write the result to `content/drafts/<slug>.json`.

Never write your edits directly to `content/pages/<slug>.json`. The `pages/` directory holds
the published state. Writing there bypasses the draft/publish workflow and breaks the version
history.

### Creating a new page

Use the `agntcms-create-page` skill instead. It creates a draft via the API endpoint and
returns a preview URL so the editor can add sections through inline editing. Do not write
page files directly — the create-page workflow ensures proper slug validation and preview
URL delivery.

### Publishing a draft

Do not promote a draft by moving or copying files yourself. Publishing is a runtime operation:
- In the admin UI: the editor clicks Publish.
- When instructed to publish programmatically: call the draft publish API endpoint
  (`POST /api/agntcms/draft/publish` with the slug in the request body).

The runtime handles moving `drafts/<slug>.json` to `pages/<slug>.json`, writing a timestamped
snapshot to `history/<slug>/`, and committing the change to git. If you move files manually
you will skip the history snapshot and the git commit.

---

## JSON page format

```json
{
  "slug": "home",
  "seo": {
    "title": "Home — My Site",
    "description": "Welcome to my site"
  },
  "sections": [
    {
      "id": "hero-1",
      "type": "Hero",
      "data": {
        "title": "# Welcome",
        "image": { "filename": "abc123def456.jpg", "alt": "Descriptive alt text" }
      }
    },
    {
      "id": "text-1",
      "type": "TextBlock",
      "data": {
        "body": "## Hello\n\nSome content here."
      }
    }
  ]
}
```

Field-by-field rules:

- `slug` — required, must match the file path. Nested slugs use `/` as separator.
- `seo` — optional. `title` and `description` are both optional within it.
- `sections` — required, may be an empty array for a blank page.
- `sections[].id` — required, must be unique within the page. Use short descriptive slugs
  (`hero-1`, `cta-2`). You assign this; the runtime does not generate it.
- `sections[].type` — required, must exactly match the `name` value from `defineSection` in
  the corresponding section's `index.ts`. Mismatches cause a runtime rendering error.
- `sections[].data` — required, shape is determined by the section's schema. See the section's
  `index.ts` or `schema.ts` for field names and types.
- Image field values are `ImageValue` objects: `{ "filename": "<asset>", "alt": "<description>" }`.
  The filename is the content-addressed asset from `public/assets/` (not a path or URL).
  The alt text is collected in the image picker modal and stored here in the section data.
  Example: `"image": { "filename": "abc123def456.jpg", "alt": "Descriptive alt text" }`.
- `RichTextField` values are rendered as Markdown by `<EditableRichText>` — use markdown
  syntax for headings, bold, italic, and links in these fields.
- `TextField` values are rendered as plain text by `<EditableText>` — markdown syntax is
  not processed and will appear as literal characters. Keep `TextField` values as plain strings.

---

## Markdown and SEO heading rules

`RichTextField` values are rendered as Markdown by `<EditableRichText>`. `TextField` values
are plain text — markdown syntax has no effect in them. The supported Markdown syntax for
`RichTextField`:

- `# Heading` → `<h1>` (page title — **one per page**, typically in the Hero section)
- `## Heading` → `<h2>` (section headings)
- `### Heading` → `<h3>` (subsections within a section)
- `**bold**` → bold text
- `*italic*` → italic text
- `[text](url)` → link
- Line breaks are preserved.

**Why heading markers matter:** Section JSX no longer wraps `<EditableRichText>` fields in
`<h1>` or `<h2>` — the markdown renderer emits those elements from the field source itself.
A RichTextField value with no leading `#` renders as a paragraph `<p>`, not a heading. For
fields that are semantically headings (`title`, `headline`, nested `title`), always start the
value with the appropriate number of `#` markers.

Quick-reference table — heading level by field:

| Field | Heading level | Markdown |
|-------|--------------|----------|
| Hero `title` | h1 | `# Headline` |
| `headline` (CTA, FAQ, Features, Pricing, ...) | h2 | `## Headline` |
| Nested `title` (feature, step, principle, milestone) | h3 | `### Title` |

### SEO heading hierarchy

Follow these rules when writing or editing text content:

1. **One `#` (h1) per page.** The page's main title (usually the Hero title field) should
   use `# `. No other field on the page should use `# `.
2. **`##` (h2) for section-level headings.** Each section's primary heading should use `## `.
3. **`###` (h3) for sub-headings within a section.** Use sparingly.
4. **Never skip heading levels.** Don't jump from `#` to `###` — use `##` in between.
5. **Short text fields can use headings too.** A Hero's `title` field should be `# Welcome`
   not just `Welcome`.

---

## Why there are no MCP CRUD tools for content

The MCP server exposes only task-coordination tools (`report_task_done`, `report_task_progress`).
It has no `read_page`, `write_page`, `list_pages`, or similar tools.

This is by design (ARCHITECTURE.md §5, §7). The MCP layer stays thin so the framework stays
simple. You already have native file tools that can read and write JSON with full fidelity.
Adding content CRUD to MCP would duplicate capability, add maintenance surface, and constrain
the content format to what the API can represent. Using files directly is more powerful and
simpler.

---

## What NOT to do

- **Never write edits to `content/pages/<slug>.json` directly.** Always stage changes in
  `content/drafts/<slug>.json` first.
- **Never delete files from `content/history/`.** These are the version trail. Deletion is
  irreversible and breaks the version history UI.
- **Never manually rename or reorganize the `content/` directory structure.** Slugs are
  derived from file paths; renaming breaks the routing.
- **Never move a draft to pages yourself.** Use the publish API so the runtime can write the
  history snapshot and the git commit.
- **Never use MCP to read or write content.** Use your native file tools.

---

## Key rules

1. Draft-first for edits: read draft if it exists, write your changes back to the draft.
2. Publish is a runtime operation: do not move files, call the API or let the UI handle it.
3. The `slug` field in JSON and the file path must match exactly.
4. Section `type` must match a registered section name — mismatches cause runtime errors.
5. Image field values are `ImageValue` objects — e.g. `{ "filename": "placeholder.png", "alt": "Description" }`.
   Both `filename` and `alt` are required. Alt is stored in the section data alongside the filename;
   it is NOT a static prop on the component and is NOT stored separately on disk.
6. `content/history/` is append-only. Never delete from it.
