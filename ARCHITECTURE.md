# agntcms Architecture v0.5

High-level architecture of the framework. This document records the decisions made during design and the reasons behind them. It does not describe the implementation.

## 1. Nature of the product

agntcms is a single-process framework for building sites on Next.js with an inline content-editing UI. The Next.js application owns rendering, content storage, and admin endpoints. There is no second process, no agent channel, no MCP server — content is edited directly in the browser through inline fields and modals.

**Deployment**. The project is a regular Next.js application that deploys to Vercel or any other Next.js hosting platform. No containers, no side-car processes.

**Editing model**. Editing happens entirely in the browser through preview mode: text and image fields are click-to-edit, sections can be replaced (with type defaults), reordered, or deleted. All edits go through HTTP endpoints to the same Next.js process that renders content. The admin/preview UI is dev-time only; production deploys are read-only (see §3 and §10).

**Claude Code is optional**. The template ships with a set of skills under `.claude/skills/` that a developer's local Claude Code can load to perform scaffolding tasks (create a section, create/publish/rollback a page, edit globals). These are convenience guides for the developer working in their own terminal; the framework does not require them, and the running site does not interact with any agent.

No frameworks other than Next.js.

This is a deliberate refusal of universality in favor of simplicity and speed.

## 2. Composition

The framework consists of three npm packages, released in lockstep under one version, plus a reference template that ships bundled inside the CLI.

**`@agntcms/skills`**. A collection of modular Claude Code skills packaged as an npm package. They capture the canonical structure of the project template and tell a developer's local Claude Code how to work with it. Depends on nothing. The skills are split into modules by responsibility, which lets a user replace an individual skill (for example, the content-storage skill) when plugging in a custom adapter. The package exposes a `agntcms-skills-sync` bin that copies its bundled `SKILL.md` files into the consuming project's `.claude/skills/`; this is the mechanism a developer uses to keep the skills folder up-to-date with the installed package version (driven by the `agntcms-update-skills` meta-skill).

These skills are developer-facing only — they are loaded by the developer's local Claude Code when invoked through `/<skill-name>`. The framework does not consume them at runtime.

**`@agntcms/next`**. The runtime library of the framework. Contains the domain model, storage adapters, Next.js helpers, React components, and route handlers. It is deliberately intertwined with Next.js technologically; "stack-agnostic" is not a goal.

**`create-agntcms-app`**. The `npx create-agntcms-app@latest my-project` scaffolding command. Unscoped npm package, matching the standard `create-*` convention (create-vite, create-next-app). One command scaffolds the template, installs dependencies, and initializes `.claude/skills/` (by calling into `@agntcms/skills`). No other commands.

**`agntcms-template`**. A reference Next.js project. It is not published to npm. Instead, it is bundled inside the `create-agntcms-app` tarball at build time (the CLI build step copies `template/` into `dist/template/`). At scaffold time the CLI reads this bundled copy, calls `syncSkills` from `@agntcms/skills` to populate `.claude/skills/`, and rewrites `workspace:*` references in `package.json` to concrete versions. There is no network fetch and no GitHub tag dependency.

Dependency graph:

```
skills          (isolated)
next            (isolated)
cli       →     skills
template  →     next, skills
```

## 3. Canonical structure contract

The structure of the project template is the public contract of the framework. The skills are the single source of truth for this contract; the template is its reference implementation. Any change to the structure is a breaking change.

The template structure is split into four zones with different responsibilities.

**Frozen zone**. Files shipped by the framework that the user must not touch. Modifying them breaks the contract with the skills and the admin/preview UI. This includes the catch-all dispatcher `app/api/agntcms/[...path]/route.dev.ts`, the catch-all `app/[[...slug]]/page.tsx`, the framework `app/not-found.tsx`, `app/sitemap.ts`, `app/robots.ts`, and the `.claude/` config directory.

**User zone**. Code the user writes and changes constantly. Section definitions in `agntcms/sections/`, framework configuration in `agntcms/config.ts`, styles, business logic, wrappers in `next.config.ts`.

**Content zone**. Data, not code. Content files, assets, drafts, version history. Changed through the UI, although manual editing through files is possible.

**Config zone**. Framework settings, adapter choices, environment variables. Changed rarely but deliberately.

### Folder layout

```
my-agntcms-site/
├── app/                                  # FROZEN
│   ├── [[...slug]]/page.tsx              # the single catch-all for content pages
│   ├── not-found.tsx                     # renders the canonical `404` slug
│   ├── sitemap.ts                        # framework-generated sitemap.xml
│   ├── robots.ts                         # framework-generated robots.txt
│   └── api/agntcms/
│       └── [...path]/route.dev.ts        # catch-all dispatcher for admin endpoints (dev-only)
│
├── agntcms/                              # USER ZONE
│   ├── sections/                         # each section in its own folder
│   │   ├── Hero/
│   │   │   ├── index.ts                  # exports SectionDefinition
│   │   │   ├── component.tsx
│   │   │   ├── schema.ts
│   │   │   └── preview.png
│   │   └── ...
│   └── config.ts                         # explicit registration of sections and adapters
│
├── content/                              # CONTENT, everything committed to git
│   ├── pages/                            # published pages
│   ├── drafts/                           # drafts
│   ├── globals/                          # global content blocks (header, footer, etc.)
│   ├── history/                          # page version snapshots
│   └── history-globals/                  # global version snapshots
│
├── public/
│   └── assets/                           # CONTENT for the FS asset adapter
│
├── .claude/                              # FROZEN
│   ├── skills/                           # CLI drops @agntcms/skills here
│   └── settings.json                     # local Claude Code config (developer-side)
│
├── next.config.ts                        # USER, via withagntcms()
├── package.json
└── README.md
```

The project deploys as a regular Next.js application. Vercel is the recommended default, but the framework does not require a specific platform. No containers, no side-car processes.

### Routing model

All content pages are rendered by a single catch-all route `app/[[...slug]]/page.tsx`, except for the framework not-found page: `app/not-found.tsx` renders the content from the canonical slug `404`. Creating a page means creating a content file, not a code file. Custom React pages outside the "composition of sections" model are not supported. This is a limitation, not a temporary shortcoming.

### Section registration

Each section physically lives in its own folder `agntcms/sections/<Name>/`. This is a location convention on which the skills rely: always look for sections in one place.

Registration in the framework's registry happens explicitly through `agntcms/config.ts`:

```ts
import { defineConfig } from '@agntcms/next/config'
import { Hero } from './sections/Hero'
import { VideoIntro } from './sections/VideoIntro'

export default defineConfig({
  sections: [Hero, VideoIntro],
  // ... adapters, etc.
})
```

No codegen, no automatic filesystem scanning. Creating a section is two operations: create the folder and add two lines to the config. The skill must guard consistency between these two sources.

A section definition may carry `system: true` to mark it as **framework-managed**. System sections are still registered the same way and stored as regular globals on disk, but the admin UI treats them as configuration rather than user content: they appear in a separate "Settings" group of the Globals tab, cannot be deleted, are hidden from the section picker, and cannot be instantiated as new globals through the create form. The flag exists because some globals — `site-meta` (SEO defaults) being the first — are consumed only by framework helpers and have no meaning as page-level content. The mechanism generalizes to any future config-shaped global (search settings, analytics IDs, 404 customization) without a parallel "settings" subsystem. The handler-side enforcement is wired through `deriveHandlerDeps(config)` exported from `@agntcms/next/config`, which returns `{ allowedTypes, sectionDefaults, systemTypes }` in one call — the template's catch-all dispatcher spreads it into `createGlobalHandler` and into the draft handler (used by the section-replace endpoint) so all three derivations stay in lockstep with the registered sections.

### Update story and the catch-all dispatcher

The frozen zone has to be **updatable** by the framework without forcing every existing project to hand-merge new files. If a new CMS endpoint required a new `route.ts` proxy in `app/api/agntcms/`, every existing project would have to copy that file into its frozen zone on every release — a manual step that defeats the purpose of having a frozen contract.

The contract resolves this with two mechanisms:

1. **One catch-all dispatcher for the entire admin surface.** All admin endpoints (`assets`, `draft/*` including `draft/replace-section`, `page/*`, `global/*`, `global-draft/*`, `preview/*`) are served by a single file in the template: `app/api/agntcms/[...path]/route.dev.ts`. Inside, it calls `createagntcmsRouteHandler` from `@agntcms/next/handlers`, which holds the routing table. New endpoints are added to that table inside the framework and arrive in user projects through a regular `pnpm up @agntcms/next` — the template is not touched.

2. **The `.dev.ts` suffix and `pageExtensions`.** `withagntcms()` sets `pageExtensions` to `['ts', 'tsx', 'js', 'jsx']` in production and adds `'dev.ts'` / `'dev.tsx'` in development. Any route or page file whose name ends in `.dev.ts(x)` is therefore visible to Next.js only during `pnpm dev`. The catch-all dispatcher uses this suffix, so the entire admin surface disappears from the production build — `next build` only emits `[[...slug]]`, `not-found`, `sitemap`, and `robots`. The admin/preview UI is a dev-time tool by design; production is read-only.

`withagntcms()` also injects `outputFileTracingIncludes: { '/**': ['./content/**/*'] }` (merged with any user-provided entries). Nothing in the codebase `import`s the JSON files under `content/`; they are read from disk at request time by the filesystem adapter. Without this hint, Next.js does not trace them and a serverless deploy (Vercel) ships without the content directory, making every page render as not-found. Users running on a long-lived server with the repository present on disk do not need this, but the cost of always emitting it is zero.

## 4. Data model and versioning

### A page as an array of sections

A page is a thin wrapper over metadata and an ordered array of sections. All typing and rendering logic lives at the section level, not the page level.

```
Page
├── metadata (slug, seo, ...)
└── sections: Section[]
        ├── Section { type: "Hero", id, data: {...} }
        ├── Section { type: "TextBlock", id, data: {...} }
        └── Section { type: "ImageGallery", id, data: {...} }
```

### Page metadata

In addition to `slug` and `sections`, a page has a `seo` block (required) and several optional metadata fields, which are read and written as regular fields of the content file:

- `seo: { title, description, ogImage?, canonical? }` — required SEO block.
  - `title` and `description` are required and validated as non-empty strings at the storage→runtime and HTTP-handler boundaries. `title` is the literal content of `<title>` (no layout-level templates); whether to include the brand is the author's call.
  - `ogImage?: ImageValue` — the page's OG image, with the fallback chain `seo.ogImage → page.coverImage → site-meta.defaultOgImage`.
  - `canonical?: string` — explicit canonical URL; when absent it is derived from `site-meta.baseUrl + slug`. If provided, it must be a non-empty string.
- `tags?: string[]` — arbitrary tags, used by `listPages` (see below) for queries like "all blog posts".
- `excerpt?: string` — short description, for rendering in list sections (PostList).
- `coverImage?: ImageValue` — cover image for blog cards, etc.
- `publishedAt?: string` (ISO 8601) — publication date, for sorting in queries. If unset, the page file's mtime is used for sorting.

These fields are flat (not nested into a separate namespace) because they are general-purpose — tags and excerpt are useful for more than blogs.

Site-wide SEO defaults (site name, baseUrl, default OG image, default description) live in the built-in `site-meta` global, which is read through the user-zone accessor `agntcms/site-meta.ts` and consumed by frozen `app/sitemap.ts`, `app/robots.ts`, `app/[[...slug]]/page.tsx generateMetadata`, and `app/layout.tsx generateMetadata`. `metadataBase`, default OG/Twitter card, and the canonical fallback all derive from here.

### Page queries (listPages)

The runtime provides `listPages({ tag?, limit?, sort? })`, which returns an array of `PageSummary` (a page without `sections` — only metadata and slug). This is needed for blog indexes and similar list pages.

```ts
const posts = await runtime.listPages({ tag: 'post', sort: 'newest', limit: 10 })
// posts: { slug, seo, tags, excerpt, coverImage, publishedAt }[]
```

Sorting is by `publishedAt` (if set) or by the page file's mtime. The filter language is intentionally minimal (one tag, limit, sort): YAGNI; this can be extended on top without breaking changes.

`listPages` is also exposed through the handler `app/api/agntcms/page/list?tag=...&limit=...&sort=...`, so that client sections like PostList can query it without server-rendering.

### Field types and section schemas

Field types (`TextField`, `RichTextField`, `ImageField`, `ReferenceField`, etc.) are built into `@agntcms/next` and are not user-extensible. This is a deliberate restriction for editing-UI consistency.

Section schemas are defined by the user in the template, by composing built-in field types.

### Versioning

Versioning is based on full snapshots, not patches. Each draft is a full copy of the page. Each publish that changes content creates a new history entry: if the page being published is semantically identical to the latest entry in the history of the same slug (deep-equal over parsed JSON), no new entry is written. This removes noise on rollback-to-latest and on publishes without real edits; the page file itself is still rewritten atomically. Branches are not supported.

Globals follow the same rules: every change that actually modifies content writes a snapshot to `content/history-globals/<name>/<ts>.json` with the same dedupe rule. A separate `history-globals` bucket is needed so that a page slug and a global name do not collide (for example, a page `home` and a global `home`).

Version history lives in files under `content/history/` and `content/history-globals/`, not in git. Git is used for collaborative development of code and deployment; our content-versioning system lives in parallel to it. This is a separation of concerns: git does not know about the domain concepts "draft" and "published version".

All folders under `content/` (including `pages/`, `drafts/`, `globals/`, `history/`, `history-globals/`) are committed to git. This keeps the repository and the production site in a consistent state.

### Publishing and git

Publishing is a filesystem operation: the runtime moves `content/drafts/<slug>.json` to `content/pages/<slug>.json` and writes a snapshot to `content/history/<slug>/<ts>.json`. That is everything the runtime does.

**The runtime does not commit to git**. Content has changed on disk — the user decides when to commit and push. Typical flow: the user makes several edits locally through the UI, sees the result on `pnpm dev`, then `git add content/ && git commit && git push`, and Vercel auto-deploys the changes.

## 5. Adapters

The extension points are `ContentStorageAdapter` and `AssetStorageAdapter`. There are no other adapters. There is no LLM adapter.

The default implementations of both adapters work with the filesystem.

### The "adapter plus skills" contract

Any content-storage adapter ships together with developer-facing skills. The default FS adapter ships with the skills bundled in `@agntcms/skills`. Custom adapters must ship their own skill set so that a developer working with that adapter (and the developer's local Claude Code) has guides tailored to the adapter's storage layout — where pages live, how drafts are kept, how to publish.

The framework does not duplicate CRUD over content in a separate API layer — the inline editing UI talks to the adapter through the handler layer (`@agntcms/next/handlers`), and the developer talks to the adapter through their own file tools, guided by the skills.

## 6. Live editing

### User experience

Editing happens in three modes of different nature, all synchronous and client-side.

**Text** is edited through a modal with a two-pane MD editor (source on the left, preview on the right). Hovering over text shows an outline; clicking opens the modal. Saves go through the draft endpoint.

**Image** is edited through an upload-and-replace modal, with fields like alt and similar.

**The whole section** is replaced through a picker modal. Hovering over a section shows an edit icon (⇄); clicking opens a modal listing the available section types. Selecting a new type calls `POST /api/agntcms/draft/replace-section`, which swaps the section with one of the new type and default values pulled from the schema (`sectionDefaults`, derived from the section registry — see §3). Existing content in that section is lost — the operation is destructive by design (different schemas, no auto-conversion). Recovery is through draft history.

There are no agent-driven enhancement controls (no ✨ buttons). All edits are direct user actions.

### Contract on the section-code side

In the section component code, the user uses special React components for editable fields. This contract is **enforced in the type system** through an opaque slot type `EditableSlot<K, V>`: a section's props for editable fields are slot objects, not bare values, and they are not structurally assignable to `ReactNode`. Trying to render `{title}` directly is a typecheck error, not a runtime surprise.

```tsx
import { defineSection, TextField, ImageField } from '@agntcms/next'
import { EditableText, EditableImage, EditableSlot } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'

interface Props {
  readonly title: EditableSlot<'text', string>
  readonly image: EditableSlot<'image', ImageValue>
}

export function HeroComponent({ title, image }: Props) {
  return (
    <section>
      <EditableText field={title} />
      <EditableImage field={image} />
    </section>
  )
}
```

If the user writes `{title}` or `<h1>{title}</h1>`, TypeScript rejects the code, pointing at the specific field. The contract is "structurally impossible to circumvent".

The section outline and the section-replace icon are added automatically by `SectionRenderer`; the user does not write them into the section code.

### The slot contract and its boundaries

`EditableSlot<K, V>` is a phantom-branded object `{ readonly [__slot]: K; readonly value: V | PreviewFieldLike<V> }` with a unique-symbol key. The brand exists only in the type system; at runtime it is a regular object with a `value` field. The cost on the hot path is one allocation per field in `SectionRenderer.wrapSectionProps`.

The lift of a value into a slot happens **at the SectionRenderer boundary**, not in `getContent`. This is a deliberate separation:

- `getContent` stays "bare": in production mode it returns plain data, in preview mode it returns `PreviewField<T>` metadata. This is a public contract and it does not change.
- `SectionRenderer` (and `GlobalSlot`, and preview images in `SectionPickerModal`) passes schema fields through `wrapAsSlot(kind, value)` before calling the section component. The slot's `value` carries either a bare value (production) or a `PreviewFieldLike<V>` with origin metadata (preview) — in both cases through the same wrapper.
- This means: trying to "harmonize" the behavior by wrapping values in `getContent` breaks the public contract. This invariant is fixed by a comment in `runtime/getContent.ts` and a test that asserts `getContent` returns the bare shape.

`ListField` is recursive: items inside a slot are `SlotItem<S>`, where each item field is itself a slot. This makes it impossible to write `<span>{item.text}</span>` inside `renderItem` — typecheck error. The single public helper for reading a slot's value is `read<V>(slot): V`.

What is **not** wrapped in a slot: `ReferenceField` (a `ReferenceValue` arrives raw, because references are not inline-edited).

### The dual nature of `getContent`

In preview mode `getContent` returns data with metadata about the origin of each field (`PreviewField<T>` — `pageSlug`, `sectionId`, `fieldPath`, `source`, `revision`). This is needed so that editable components know what to save and where. In production mode bare data is returned without wrappers, to avoid paying for metadata at runtime.

The slot wrapping (see above) **does not** change this dual nature. The slot lives strictly on the `SectionRenderer ↔ section component` boundary; `getContent` still returns the shape described in this section. This is the thinnest spot in the public API, and it stays unchanged.

## 7. Internal structure of `@agntcms/next`

```
packages/next/src/
├── domain/        # types, depends on nothing
├── storage/       # adapters for content and assets
├── sections/      # defineSection + runtime registry
├── preview-tokens/# in-memory store of one-time preview tokens
├── runtime/       # getContent, publish, preview
├── handlers/      # route handlers, proxied by the template
├── react/         # client components for render and edit (the entire `'use client'` zone)
├── react-server/  # RSC-only zone: server components that pull data themselves (GlobalSlot)
├── config/        # withagntcms() and defineConfig()
└── index.ts       # public exports
```

Dependencies:

```
domain         ← nobody
storage        → domain
sections       → domain
preview-tokens → nothing (only node:crypto)
runtime        → domain, storage
handlers       → domain, storage, runtime, preview-tokens
react          → domain, runtime (types only), sections (values: `wrapSectionProps`, `wrapAsSlot`); contains ALL `'use client'` components of the package
react-server   → domain, runtime, sections (values: `wrapSectionProps`); RSC-only — NOT a single `'use client'` file. If an RSC node needs a client provider (e.g., `<GlobalSaveProvider>`), it is imported through the public boundary `@agntcms/next/client`, not via a relative path
config         → nothing from the rest
```

Main rules:
- `domain` is the center, depends on nothing, tested in full isolation.
- `storage` does not know about React or runtime.
- `react` does not depend on `storage`. React components receive data through `runtime` (types only) and talk to the server through HTTP endpoints in `handlers/`; server dependencies do not leak into the client bundle.
- `react` (and `react-server`) imports **values** from `sections`: `wrapSectionProps` and `wrapAsSlot` live in `sections/` because the slot brand `EditableSlot<K, V>` is declared there together with `defineSection` (see §6, "The slot contract and its boundaries"). The alternative — moving the helper into `runtime/` — would require `react` to import a value from `runtime/`, which would break the isolation of the client bundle from the server-side storage (which also sits in `runtime/`). The weaker breach was chosen: `sections/` is a pure zone with no I/O; importing a value from it into `react` is cheaper.
- `react-server` is an **RSC-only** zone. Every file here must be a React Server Component without the `'use client'` directive. These components call the runtime themselves (for example, `<GlobalSlot>`, which pulls a global in `app/layout.tsx`). It is imported only from `/server`. `'use client'` components live in `react/` and are re-exported from `@agntcms/next/client`; if an RSC node needs such a provider (e.g., `<GlobalSlot>` wraps the render in `<GlobalSaveProvider>`), it imports it through the package's public boundary (`@agntcms/next/client`), not via a relative path — this is the canonical Next.js pattern for server→client boundaries.

## 8. Package public API

The package has several subpath exports, so that server imports do not leak into the client bundle.

**`@agntcms/next`** (root). Common types and factories needed everywhere. Contains `defineSection`, the field types (`TextField`, `RichTextField`, `ImageField`, `ReferenceField`, `LinkField`, `ListField`, `NumberField`, `BooleanField`, `SelectField`), and the domain types (`SectionDefinition`, `Page`, `Section`). Types and pure functions only, no runtime code.

**`@agntcms/next/server`**. The server side. Contains `getContent`, `getGlobal`, `listPages`, `publishDraft`, `<GlobalSlot />`, access to adapters (`ContentStorageAdapter`, `AssetStorageAdapter`), and the adapter interfaces for user implementations. Imported only from server components, route handlers, and `next.config.ts`.

**`@agntcms/next/client`**. React components for rendering and editing. Contains `<PageRenderer />`, `<SectionRenderer />`, `<EditableText />`, `<EditableImage />`, `<EditableLink />`, `<EditableList />`, `<EditableNumber />`, `<EditableBoolean />`, `<EditableSelect />`, `<PreviewToolbar />`, `<AdminModal />`, `<SectionPickerModal />`, `<SectionReplaceOverlay />`, `<SectionWrapper />`, and hooks for preview mode.

**`@agntcms/next/handlers`**. Route handlers for the CMS API. The primary export is `createagntcmsRouteHandler`, the catch-all dispatcher invoked by the template's single `app/api/agntcms/[...path]/route.dev.ts` (see §3). Individual handler factories are also exported for callers that want to mount specific endpoints on their own routes.

**`@agntcms/next/config`**. `withagntcms()` for wrapping `next.config.ts` and `defineConfig()` for a typed `agntcms/config.ts`. Also factories for default adapters.

User section code will have two imports: one from the root (`defineSection`, field types), one from `/client` (`EditableText`, `EditableImage`). This is the deliberate price of separating client and server code.

## 9. Principles

The decisions in this document were made under the following principles:

1. **KISS and YAGNI**. If a feature is not needed, it does not exist.
2. **Explicit contracts, not magic**. Folder-based registries and codegen are rejected in favor of explicit registration.
3. **Adapters only where they are justified by a real need for substitution**. Not "just in case".
4. **Unidirectional dependencies**. No cycles, no back-arrows.
5. **The documentation and onboarding must reflect the framework's nature honestly**: a single-process Next.js CMS with inline editing.
6. **Skills are part of the architecture, not documentation**. They are the single source of truth about project structure and the contract a custom adapter must teach a developer's local Claude Code.
7. **Stack-agnostic is not a goal**. When (and if) a second stack is needed, this will be a deliberate refactor, not the activation of a hidden abstraction.
8. **Skills are developer-facing**. They guide a human (or that human's local Claude Code) through scaffolding tasks: creating sections, publishing drafts, rolling back, editing globals. The running framework does not consume them. A custom adapter ships its own skills so a developer working with that adapter has guides tailored to its layout.

## 10. Known risks and limitations

**Risk**: the dual nature of `getContent` is the thinnest spot of the API; a mistake in the type design would be a constant source of pain. It needs special attention.

**Risk**: section replacement is destructive. The picker swaps to a new type with default values; existing data in that section is gone. The UI must communicate this clearly, and recovery flows through draft history (per-page history snapshots).

**Limitation**: single-user editorial tool. Two editors working in parallel will cause races.

**Limitation**: field types are not user-extensible without a fork.

**Limitation**: custom React pages outside the "composition of sections" model are not supported.

**Limitation**: the admin/preview UI is dev-time only. Production deploys (Vercel) are read-only: content changes happen during development, get committed to git, and ship through normal git push → Vercel auto-deploy.

**Limitation**: the only supported framework is Next.js. The deploy is a regular Next.js application; Vercel is recommended by default, but the framework is not tied to a specific platform.

## 11. What is not in this version

Deliberately deferred: extensible field types, custom routes outside the sections model, multi-user editing, a second stack besides Next.js, branches in versioning, `agntcms doctor`, schema migrations in the CLI, patch-based drafts, public form submissions (visitor-facing forms and submission storage), per-section structural layout variants, the section-settings modal for editing top-level technical fields, support for drafts in `listPages` (returns published pages only regardless of preview/published context — draft-only pages do not appear in `PostList`/similar queries; adding a `mode` parameter is deferred).

Also deferred: any form of agent-driven content editing through a server-initiated channel (✨ enhance buttons, AI-driven section replacement, page-from-brief generation). The MCP/channel approach was prototyped in v0.2–v0.4 and removed in v0.5 to focus the product on direct inline editing. Reintroducing it would require a new, deliberate architecture step.
