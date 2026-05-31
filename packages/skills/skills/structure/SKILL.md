---
name: agntcms-structure
user-invocable: true
description: Teaches the agent the canonical agntcms project layout — frozen zone, user zone, content zone, config zone — and where sections live. Load this skill before any other agntcms skill.
---

# agntcms Project Structure

Load this skill first. Every other agntcms skill assumes you understand the layout described here.

agntcms projects are regular Next.js applications. Deploy to Vercel or any Next.js-compatible
platform. No containers, no side-car agent processes in production. The agent works locally
alongside `pnpm dev`; agent-driven features are dev-time only and are absent in production deploys.

---

## Top-level layout

```
<project-root>/
├── app/
│   ├── [[...slug]]/page.tsx             # FROZEN — catch-all page proxy for all content pages
│   ├── not-found.tsx                    # FROZEN — framework not-found route (renders CMS 404 page)
│   ├── sitemap.ts                       # user-editable default — reads site-meta and listPages; customize freely
│   ├── robots.ts                        # user-editable default — reads site-meta for sitemap URL; customize freely
│   └── api/agntcms/                     # FROZEN — framework route-handler proxies
│       │   # Files with .dev.ts extension are excluded from the prod build by the
│       │   # pageExtensions hook in withagntcms. Only route.ts (no .dev) runs in prod.
│       ├── _shared.ts                   # module-level singletons (runtime, bridge, task store)
│       └── [...path]/route.dev.ts       # catch-all dispatcher — all admin/agent endpoints (dev-only)
│
├── agntcms/                           # USER ZONE — where you work
│   ├── sections/                        # one subdirectory per section type
│   │   └── <SectionName>/
│   │       ├── index.ts                 # exports the SectionDefinition (defineSection call)
│   │       ├── component.tsx            # React component
│   │       ├── schema.ts                # field schema (optional — may be inlined in index.ts)
│   │       └── preview.png              # visual thumbnail used by the UI and agent
│   └── config.ts                        # explicit section registry and adapter config
│
├── content/                             # CONTENT ZONE — data, not code
│   ├── pages/                           # published page JSON files
│   ├── drafts/                          # draft page JSON files
│   ├── globals/                         # published global content blocks
│   ├── global-drafts/                   # pending global drafts (editor UI only)
│   ├── history/                         # full-snapshot page version history
│   └── history-globals/                 # full-snapshot global version history
│
├── public/
│   └── assets/                          # uploaded assets (content-addressable by SHA-256 hash)
│
├── .claude/
│   ├── skills/                          # FROZEN — agntcms skills (installed here by CLI; do not edit manually)
│   └── settings.json                    # FROZEN — Claude Code settings
│   # .claude/launch.json is NOT frozen — it is per-developer harness state (gitignored)
│
├── next.config.ts                       # USER — wrapped with withagntcms()
├── package.json
└── README.md
```

---

## The four zones

### Frozen zone — hands off

These files and directories are owned by the framework. They proxy into `@agntcms/next` internals
and must not be modified by the user or by you.

Frozen paths:
- `app/[[...slug]]/page.tsx`
- `app/not-found.tsx`
- `app/api/agntcms/` (the entire directory and all files within it)
- `.claude/settings.json`
- `.claude/skills/` (managed by the CLI — do not add or remove files manually)

Not frozen (user-editable defaults):
- `app/sitemap.ts` — ships as a working default that reads site-meta and listPages; users may customize it freely.
- `app/robots.ts` — ships as a working default that reads site-meta for the canonical base URL; users may customize it freely.
- `.claude/launch.json` — per-developer harness file (Claude Code preview/dev-server launch config); gitignored; the framework has no opinion on its contents.

If you detect that a frozen file has been modified (content differs from the framework template),
warn the user immediately. Do not try to merge or fix the file yourself. The recovery path is:
re-run the scaffold command or restore the file from the published template at the matching
version tag. The `agntcms-frozen-guard` skill has detailed detection and recovery steps.

Note: there is no `.claude-plugin/` directory or `.mcp.json` in agntcms projects. The framework
does not use a Claude Code channel plugin. Agent interactions happen through direct developer
conversations with Claude Code.

### User zone — where you create and edit

`agntcms/config.ts` and `agntcms/sections/` are the places you touch when working with sections.
This is where the user defines the vocabulary of their site.

- `agntcms/sections/` — one directory per section type, each exporting a `SectionDefinition` via `defineSection`.
- `agntcms/config.ts` — explicit registration for sections (in `sections` array) and adapter config.

`next.config.ts` is also user-editable: it wraps the Next.js config with `withagntcms()`.

### Content zone — data files, not code

`content/pages/`, `content/drafts/`, `content/globals/`, `content/global-drafts/`,
`content/history/`, and `content/history-globals/` hold JSON files. All are committed to git.

- `content/history/` — full-snapshot version history for pages (one subdirectory per slug).
- `content/history-globals/` — full-snapshot version history for globals (one subdirectory per name).
  The first snapshot is written automatically on the first save after this bucket exists; no seed
  snapshot ships with the template.
- `content/global-drafts/` — pending global drafts written by the editor UI when the editor saves
  in preview mode. The runtime promotes them to `content/globals/` on publish. The agent must NOT
  write to this bucket; write `content/globals/<name>.json` directly instead.

`public/assets/` stores uploaded binary assets under content-addressable filenames (SHA-256 hash
plus the original extension). Do not rename these files.

### Config zone

`agntcms/config.ts` registers sections and configures adapters. It changes rarely but deliberately.
Edits here always have a corresponding change in `agntcms/sections/`.

---

## Content file format

### Pages

Each page is a single JSON file in `content/pages/<slug>.json` (published) or
`content/drafts/<slug>.json` (draft). The structure:

```json
{
  "slug": "home",
  "seo": {
    "title": "Page title shown in browser tab",
    "description": "Meta description for search engines"
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

Key points:
- `slug` matches the filename without extension and the URL path.
- `seo` is **required** on every page. Both `title` and `description` must be non-empty strings.
  Omitting `seo` (or leaving `title`/`description` blank) produces a malformed Page object —
  the FS adapter does not validate JSON, so the type mismatch is invisible until render time.
- Each section entry has a stable `id` (you assign this when creating a section, use a short
  descriptive slug like `hero-1`), a `type` matching an entry in `agntcms/config.ts`, and a
  `data` object whose shape is defined by the section's schema.
- `image` fields hold an `ImageValue` object: `{ "filename": "<asset>", "alt": "<description>" }`.
  Both fields are required. Example: `"image": { "filename": "abc123def456.jpg", "alt": "Descriptive alt text" }`.
  Alt is stored in section data (collected via the image picker); it is not a static prop on the component.
- All text field values (`TextField` and `RichTextField`) are rendered as Markdown.
- Versioning uses full snapshots. `content/history/` files are complete page copies, not patches.

### Globals

Each global is a single JSON file in `content/globals/<name>.json`. The structure:

```json
{
  "name": "site-header",
  "type": "SiteHeader",
  "data": {
    "brandName": "My Site",
    "logo": { "filename": "abc123.jpg", "alt": "My Site logo" }
  }
}
```

- `name` is the unique identifier used in `<GlobalSlot name="...">`. It must match the
  filename (without `.json`).
- `type` is the section `name` as registered in `agntcms/config.ts`. Any section can be
  used as a global — there is no separate "global type".
- `data` matches the section's schema exactly — same field types and value shapes.
- Version history lives in `content/history-globals/<name>/`. The runtime writes snapshots
  on admin publish events; do not create them manually.
- Pending editor drafts live in `content/global-drafts/<name>.json`. The agent must write
  `content/globals/<name>.json` directly; the `global-drafts/` bucket is managed by the
  editor UI.

See the `agntcms-globals` skill for the full workflow: creating a global, editing its
content, wiring `<GlobalSlot>` in `app/layout.tsx`, and the draft/publish lifecycle.

### Built-in globals

The template ships with three globals that the framework reads automatically:

| Global name | Section type | Purpose |
|---|---|---|
| `site-header` | `SiteHeader` | Site navigation rendered at the top of every page |
| `site-footer` | `SiteFooter` | Site footer rendered at the bottom of every page |
| `site-meta` | `SiteMeta` | SEO defaults: site name, base URL, default OG image, default description |

`site-meta` is special: it is NOT rendered by `<GlobalSlot>` in `app/layout.tsx`. Instead,
it is read directly by `generateMetadata` in `app/[[...slug]]/page.tsx` and by
`app/layout.tsx`'s `generateMetadata` to supply `metadataBase`, the title template, and OG
fallbacks. It is also consumed by `app/sitemap.ts` and `app/robots.ts` to derive the
canonical base URL. Both `sitemap.ts` and `robots.ts` ship as working defaults and are
user-editable; their default implementations read site-meta but users may customize them.

Do not add a `<GlobalSlot name="site-meta" …>` call to `app/layout.tsx` — the component
intentionally renders `null` and the data is read through a direct `runtime.getGlobal` call
inside the metadata helpers.

---

## How section registration works

Registration is always explicit. There is no folder scanning, no codegen, no auto-discovery.

Creating a new section is exactly two operations:

1. Create `agntcms/sections/<SectionName>/` with `index.ts`, `component.tsx`, and `preview.png`
   (and optionally `schema.ts`).
2. Add two lines to `agntcms/config.ts`: the import and the entry in the `sections` array.

Example `agntcms/config.ts` after adding two sections:

```ts
import { defineConfig } from '@agntcms/next/config'
import { Hero } from './sections/Hero'
import { TextBlock } from './sections/TextBlock'

export default defineConfig({
  sections: [Hero, TextBlock],
  // adapter config goes here
})
```

If a folder exists in `agntcms/sections/` but is not listed in `config.ts`, the section is
invisible to the framework and the agent. Both steps are required and must stay in sync. The
`agntcms-sections` skill has the detailed workflow.

---

## Routing model

All content pages are served by the single catch-all `app/[[...slug]]/page.tsx`, except the real
Next.js not-found route: `app/not-found.tsx` renders the canonical CMS page at slug `404`.
Creating a new page means creating a new JSON file in `content/pages/` — not a new file under
`app/`. Custom React pages outside the section-composition model are not supported in v1.

Canonical system-page slugs:
- `404` — the editable content backing the actual Next.js not-found page.
- `500` — reserved for the editable server-error page.
- Do not invent aliases like `error-404`, `not-found`, `_not-found`, `404-page`, `error-500`,
  `500-page`, or `server-error`.

---

## Content editing

Content is edited by reading and writing JSON files in `content/` with your native file tools.
There are no MCP CRUD tools for content; the file system is the authoritative content store.
Use the framework HTTP endpoints (e.g. `draft/publish`, `page/rollback`) for operations that
must be atomic or that trigger a git commit — never replicate their logic with direct file moves.

---

## Key rules — commit these to memory

1. Never modify any file in the frozen zone. If you are about to edit a file under
   `app/api/agntcms/`, `app/[[...slug]]/`, `app/not-found.tsx`, `.claude/settings.json`,
   or `.claude/skills/` — stop. That is a framework file. Find another way or ask.
   (`app/sitemap.ts` and `app/robots.ts` are user-editable defaults, not frozen.)

2. Section registration is explicit. A section folder without a `config.ts` entry does not
   exist from the framework's perspective. Both the import and the array entry are required.

3. Content edits go through `content/` JSON files using your native file tools. Not through MCP,
   not through any API. Pages live in `content/pages/` and `content/drafts/`. Globals live in
   `content/globals/`. Page version history lives in `content/history/<slug>/`, global version
   history in `content/history-globals/<name>/`.

4. Asset filenames are SHA-256 content-addressed. Do not rename them. Reference them by filename
   in content JSON.

5. When orienting yourself in an unfamiliar agntcms project, read `agntcms/config.ts` first.
   It tells you which sections exist and which adapters are configured.
