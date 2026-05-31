---
name: agntcms-globals
user-invocable: true
description: Globals are site-wide content blocks (header, footer, announcement bar) rendered in app/layout.tsx via GlobalSlot. This skill covers creating, editing, wiring, and the draft/publish lifecycle for globals.
---

# agntcms Globals

Load the `agntcms-structure` and `agntcms-sections` skills before this one. Globals share
the section vocabulary — every global is backed by a section definition — but they live
outside the page model and are rendered in `app/layout.tsx` rather than in page content.

---

## What a global is

A **global** is a site-wide content block that appears on every page: a site header, footer,
announcement bar, cookie banner, etc. Globals are NOT pages. They do NOT appear in
`content/pages/`. They use the same field-type vocabulary as sections, but their lifecycle
is different:

- Content lives in `content/globals/<name>.json` (published). A pending draft lives in
  `content/global-drafts/<name>.json` and is promoted to the published bucket on publish.
- Version history lives in `content/history-globals/<name>/` (full snapshots, same
  deduplification rule as page history — a snapshot is only written when content actually
  changes).
- They are rendered in `app/layout.tsx` via `<GlobalSlot>` — an RSC that fetches the
  global's content and renders it using the matching section component.
- The admin UI includes globals in the "Globals" tab of the AdminModal, where they can
  be edited exactly like pages (inline editing through `EditableText`, `EditableImage`, etc.).

---

## Content file format

Each published global is a JSON file at `content/globals/<name>.json`:

```json
{
  "name": "site-header",
  "type": "SiteHeader",
  "data": {
    "brandName": "My Site",
    "logo": { "filename": "abc123.jpg", "alt": "My Site logo" },
    "navItems": [
      { "_id": "nav-1", "label": "About", "link": { "href": "/about", "label": "About" } }
    ],
    "ctaButton": { "href": "/contact", "label": "Contact" }
  }
}
```

Key points:
- `name` is the unique identifier used in `<GlobalSlot name="...">`. It must match the
  filename (without `.json`) exactly.
- `type` is the section name (as registered in `agntcms/config.ts`) that defines the
  schema and renders the UI. Any section definition can be used as a global.
- `data` matches the section's schema exactly. The same field types and value shapes apply.
- `ListField` items carry the `_id` field (set by the editor; preserve it when editing
  content manually so the editor can track items across reorder and delete).

There is NO separate "global type" — a global is a section instance pinned to a name, not
a page.

---

## Step 1: Create the section definition (if not already done)

If no section definition exists for the global's visual shape, create one first using the
`agntcms-section-new` or `agntcms-sections` skills. The section definition lives under
`agntcms/sections/<SectionName>/` and is registered in `agntcms/config.ts` exactly like
any other section.

There is nothing special about a section used as a global versus one used in a page — the
same component renders in both contexts.

---

## Step 2: Create the content file

Create `content/globals/<name>.json` with the structure shown above.

Rules:
- `name` must be lowercase, using hyphens for multi-word names (e.g. `site-header`,
  `announcement`). It becomes the URL-safe identifier used in `<GlobalSlot>`.
- `type` must match a section `name` already registered in `agntcms/config.ts`.
- `data` must satisfy the section's schema — every required field must be present.
- Do not create a history snapshot manually. The first snapshot is written automatically
  the first time the global is saved through the admin UI.

---

## Step 3: Wire GlobalSlot in app/layout.tsx

`app/layout.tsx` is in the frozen zone and cannot be edited directly. However, adding a
`<GlobalSlot>` call for a newly created global IS an expected user-zone change because
`app/layout.tsx` is **not** frozen — only the files under `app/api/agntcms/`,
`app/[[...slug]]/page.tsx`, `app/not-found.tsx`, `.claude/settings.json`, and
`.claude/skills/` are frozen (see `agntcms-structure` and `agntcms-frozen-guard`).
`app/layout.tsx` is user-editable.

To wire a global in `app/layout.tsx`:

```tsx
import { GlobalSlot, createRuntime, getPreviewMode } from '@agntcms/next/server'
import config from '@/agntcms/config'

// runtime is typically already present at the top of layout.tsx
const runtime = createRuntime({ contentAdapter: config.contentAdapter })

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Use the shared helper — do NOT use Next's draftMode() here. The
  // agntcms preview flag is a custom cookie (__agntcms_preview), not the
  // Next.js draft-mode cookie, so draftMode() would always read as disabled.
  const mode = await getPreviewMode()

  return (
    <html>
      <body>
        <GlobalSlot
          name="site-header"        // matches content/globals/site-header.json "name"
          getGlobal={runtime.getGlobal}
          definitions={config.sections}
          mode={mode}
        />
        {children}
        <GlobalSlot
          name="site-footer"
          getGlobal={runtime.getGlobal}
          definitions={config.sections}
          mode={mode}
        />
      </body>
    </html>
  )
}
```

`GlobalSlot` is an RSC (`'use server'` boundary implied by its location in the RSC tree).
Import it only from `@agntcms/next/server`. Do not import it from `@agntcms/next/client`.

`GlobalSaveProvider` is the client-side counterpart used by `GlobalSlot` internally to wire
inline editing. It is re-exported from `@agntcms/next/client` but you should not wire it
manually — `GlobalSlot` wraps the section in `GlobalSaveProvider` automatically when
`mode === 'preview'`.

---

## Global draft/publish lifecycle

Globals gained a full **draft → publish → discard** cycle in v0.2, parallel to pages. The
lifecycle matters for editor interactions; it does NOT change how the agent edits globals.

### Editor UI flow

1. The editor saves changes in preview mode — the admin UI POSTs to
   `/api/agntcms/global-draft/save`, which writes a draft to
   `content/global-drafts/<name>.json`. The published file at
   `content/globals/<name>.json` is untouched.
2. The editor publishes from the Globals tab — the UI POSTs to
   `/api/agntcms/global-draft/publish`, which promotes
   `content/global-drafts/<name>.json` to `content/globals/<name>.json` and
   writes a history snapshot.
3. The editor discards a draft — the UI POSTs to
   `/api/agntcms/global-draft/discard`, which removes
   `content/global-drafts/<name>.json`. The published file is untouched.

**Discard of a never-published global** removes the draft and leaves the user with no
record — unlike pages, where discarding without a published version is blocked. This
lets editors create and then abandon a draft-only global without side effects.

### Agent editing — always write directly

**You (the agent) write `content/globals/<name>.json` directly with your native file
tools.** Do NOT route through the draft endpoint. The draft cycle is an editor-UI
concern — editor saves go to `global-drafts/` because the editor wants an explicit
publish step before changes go live. The agent, by contrast, is making deliberate
content changes that should take effect immediately. Direct file writes to
`content/globals/<name>.json` are exactly correct for agent-driven edits.

```
# CORRECT — write the published file directly
Edit content/globals/site-header.json

# WRONG — do not call the draft endpoint from the agent
POST /api/agntcms/global-draft/save
```

After writing a global directly:

- In **published** mode: the change takes effect on the next page request.
- In **preview** mode: the admin UI reflects the updated content on the next page refresh.

Do not move globals into `content/pages/` or create a page with the same slug as a global
name — the `page` and `global` buckets are separate. A page slug `home` and a global name
`home` do not conflict.

---

## Version history for globals

Global version history lives under `content/history-globals/<name>/`. The structure mirrors
`content/history/<slug>/` for pages:

```
content/history-globals/
└── site-header/
    ├── 2026-04-20T10-30-00-000Z.json
    └── 2026-04-21T08-15-00-000Z.json
```

Each file is a full snapshot of the global's content at that point in time. Snapshots are
written automatically when a change is saved through the admin UI; they are NOT written by
the agent editing files directly. The runtime's deduplification rule applies: if the new
content is deep-equal to the most recent snapshot, no new snapshot is written.

To roll back a global: use the admin Globals tab; system globals appear in the Settings
group at the bottom of the list. There is no CLI or skill for agent-driven global rollback
in v1.

---

## The `site-meta` global

`site-meta` is a framework-managed global that holds SEO defaults consumed by the metadata
helpers in `app/[[...slug]]/page.tsx`, `app/layout.tsx`, `app/sitemap.ts`, and
`app/robots.ts`. Content file: `content/globals/site-meta.json`.

`SiteMeta` is registered with `system: true` in `agntcms/sections/SiteMeta/index.ts`. This
hides it from the section picker and the user-globals list in the admin Globals tab, and
prevents deletion through the admin UI. It appears in the Settings group at the bottom of
the globals list instead.

Fields:

| Field | Type | Purpose |
|---|---|---|
| `siteName` | `TextField` | Used as the default page title and in the title template `"%s \| <siteName>"` |
| `baseUrl` | `TextField` | Canonical base URL (e.g. `https://agntcms.dev`). Used by `sitemap.ts` and `generateMetadata` to build canonical links. Include protocol, no trailing slash. |
| `defaultOgImage` | `ImageField` | Fallback OG image when a page has no `seo.ogImage` and no `coverImage` |
| `defaultDescription` | `TextField` | Global fallback description — used in `app/layout.tsx`'s `generateMetadata` |

**`baseUrl` and OpenGraph URLs:** when `baseUrl` is empty or not a valid URL, Next.js omits `metadataBase` and OpenGraph image URLs become relative — social platforms, Slack unfurls, and search engines require absolute URLs, so set `baseUrl` to your site's origin (e.g. `https://example.com`, no trailing slash, no path) before publishing.

When editing `site-meta`:
- Edit `content/globals/site-meta.json` directly with your native file tools.
- Changes take effect on the next page request (no redeploy needed in dev mode).
- Do NOT add a `<GlobalSlot name="site-meta">` call to `app/layout.tsx` — `SiteMeta`'s
  component renders `null` intentionally; the data is read through a direct
  `runtime.getGlobal` call inside the metadata helpers, not through `GlobalSlot`.

### Typed accessor: `getSiteMeta`

All four metadata helpers (`app/layout.tsx`, `app/[[...slug]]/page.tsx`, `app/sitemap.ts`,
`app/robots.ts`) read `site-meta` through a shared typed accessor defined in
`agntcms/site-meta.ts`. Use `getSiteMeta` as the canonical way to read `site-meta` from
any metadata helper rather than calling `runtime.getGlobal` and casting:

```ts
import { getSiteMeta } from '@/agntcms/site-meta'

const siteMeta = await getSiteMeta(runtime.getGlobal)
// siteMeta.siteName   — string (defaults to 'agntcms')
// siteMeta.baseUrl    — string | null (null when absent or empty)
// siteMeta.defaultOgImage  — ImageValue | null
// siteMeta.defaultDescription  — string (defaults to '')
```

`getSiteMeta` never throws — it returns safe defaults when `site-meta` is missing. If the
`SiteMeta` schema in `agntcms/sections/SiteMeta/schema.ts` changes, update `SiteMeta`
interface and the narrowing logic in `agntcms/site-meta.ts` in one place.

---

## System globals

A section definition registered with `system: true` produces a **system global** when used
as a global. System globals are framework-managed in two specific ways:

- They are **not** shown in the section picker — authors cannot insert them as page sections.
- They **do not appear** in the user-editable globals list in the admin Globals tab; they
  appear in the Settings group at the bottom of the list instead.

The `system: true` flag does **not** block create or delete. A system global may be deleted
through the admin UI and re-created at the same name — this is the supported recovery flow
when a system global's content needs to be reset. What `system: true` does prevent is
**overwriting**: saving a different section type at an existing system global's name is
rejected with HTTP 400 `{ error: 'system_global_cannot_be_overwritten' }`. This protects
against accidentally clobbering SEO configuration by landing the wrong type at the same
name. The same overwrite guard applies at draft-save time (so a draft that would later
destroy the type on publish is rejected at the moment it is created, not at publish time).

Use `system: true` only for data-only configuration consumed by framework helpers (SEO
defaults, future search/analytics config). Do not mark visible content blocks — such as
`SiteHeader` or `SiteFooter` — as system; those are user-managed globals.

To mark a section as a system global, set the flag in its `defineSection` call:

```ts
export const SiteMeta = defineSection({
  name: 'SiteMeta',
  category: 'Global',
  system: true,
  schema,
  component: SiteMetaComponent,
})
```

The template's `app/api/agntcms/[...path]/route.dev.ts` derives all three handler
dependencies — `allowedTypes`, `sectionDefaults`, and `systemTypes` — in one call;
users do not wire these manually:

```ts
import { deriveHandlerDeps } from '@agntcms/next/config'
const { allowedTypes, sectionDefaults, systemTypes } = deriveHandlerDeps(config)
```

The form's autocomplete hides system types from the datalist so editors are unlikely to
encounter the overwrite guard in normal use. The guard fires on both direct save and
draft-save, ensuring the error surfaces at draft-creation time rather than at publish time.

---

## Creating a new global — full checklist

1. Decide on a section definition name (e.g. `AnnouncementBar`) and a global name
   (e.g. `announcement`).
2. If the section definition does not exist: create it following `agntcms-sections` /
   `agntcms-section-new`. Register it in `agntcms/config.ts`.
3. Create `content/globals/announcement.json` with correct `name`, `type`, and `data`.
4. Add a `<GlobalSlot name="announcement" ...>` call in `app/layout.tsx` at the position
   where it should appear in the page (before `{children}` for header-like globals, after
   for footer-like ones).
5. Run `pnpm typecheck` — it does not validate content JSON, but it catches any import or
   prop errors in the section component.
6. Open the admin UI and confirm the global appears under the "Globals" tab with the
   correct content.

---

## Key rules

1. **A global is a section instance, not a special type.** Any registered section can be a
   global. The `type` field in the content file links the global to its section definition.

2. **`GlobalSlot` is RSC-only.** Import it from `@agntcms/next/server`. Never import it
   from `@agntcms/next/client` or use it in a `'use client'` component.

3. **`app/layout.tsx` is user-editable.** It is NOT in the frozen zone. You can add, remove,
   and reorder `<GlobalSlot>` calls there as needed.

4. **`content/globals/` is in the content zone.** Edit these files with your native file
   tools. They are committed to git along with page content.

5. **`content/history-globals/` is written by the runtime, not the agent.** Do not create
   or edit snapshot files manually. The runtime writes snapshots on admin-UI publish events.

6. **`content/global-drafts/` is managed by the editor UI, not the agent.** When the editor
   saves in preview mode the UI writes to this bucket; when the editor publishes, the runtime
   promotes the draft to `content/globals/`. You (the agent) write `content/globals/` directly
   and must not touch `content/global-drafts/`.

7. **Global names are lowercase, hyphenated.** Match the filename: if the file is
   `content/globals/site-header.json`, the `name` field is `"site-header"` and the
   `<GlobalSlot name="site-header">` prop must also be `"site-header"`.
