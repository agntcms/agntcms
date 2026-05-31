# agntcms

This is an agntcms project. You assist the developer — you can work with code,
sections, configuration, and content.

## First time here?

This template ships with the agntcms demo (brand, home page, blog posts about agntcms
itself). To turn it into your own project, run `/agntcms-init-from-artifact` and point it
at an existing app generated from a Claude artifact — a local directory containing real
source code (React, Vue, plain HTML + CSS). The skill wipes the demo, copies the source
stylesheets verbatim under `styles/`, migrates the design tokens into `styles/theme.css`,
creates and registers every section type the source requires (using the source's actual CSS
classes and HTML structure), populates `content/pages/<slug>.json` for every page with copy
lifted verbatim from the source components, updates the globals (header, footer) from the
source's header and footer components, and writes `BRAND.md` pointing at the source. All
steps run to completion in one pass, then takes a screenshot pass to verify. Screenshots are
used to verify, not to drive implementation.

## Skill-check protocol

This protocol applies before every non-trivial step — not just at the start of a task, but
before each individual operation within a task.

**Triggers that require a skill check:**

- Editing any file in `content/` (page data, drafts, version history)
- Creating, deleting, or renaming a page
- Creating, editing, replacing, reordering, or deleting a section
- Publishing or unpublishing a page, or rolling back to a previous version
- Renaming a page slug
- Editing site-wide globals (header, footer, announcement bar)
- Any operation inside the frozen zone (even to inspect or recover it)
- Initializing a new project from a Claude Design bundle

**The gate rule:** Before calling Read, Edit, or Write on any file in `content/`,
`agntcms/sections/`, or the frozen zone — state aloud which skill covers the operation
and load it. If no skill covers the operation, say explicitly why before proceeding.

**No shortcuts.** Even if the task looks trivial ("just change the heading"), check the
list first. Skipping the skill check is not permitted even when the answer seems obvious.

## Workflow

Skills are a gate, not a suggestion. No action without a skill check first.

1. **Skill check (gate).** Before doing anything: scan the skill list below, identify
   which skill covers the next operation, and load it. If the operation is covered,
   follow the skill's instructions exactly. Do not read project files, run commands,
   or make edits until the relevant skill is loaded.
2. **Read project files only if needed.** If no skill covers the task, or if the
   skill leaves gaps, then explore the codebase — start with `agntcms/config.ts`
   (section types and adapters).
3. **Brand before design.** Before any design, styling, or copy work, read
   `BRAND.md` (design direction, tone, visual intent) and `styles/theme.css`
   (design tokens). Use Tailwind utility classes that reference theme tokens.
   Never hardcode hex values or use inline style objects.
   If a Claude Design bundle has been set up, `BRAND.md` will point to it
   under `design/<bundle-name>/`. Read `design/<bundle-name>/README.md`
   end-to-end for preview cards, prototype kits, asset sources, and
   iconography detail. If the bundle ever contradicts `BRAND.md`, `BRAND.md` wins.

## Hard rules

1. **Skills first.** Load the relevant skill before touching any content file,
   section file, or frozen file. This is not optional and has no exceptions.
2. **Never modify frozen zone files.** If a frozen file looks wrong, load
   `agntcms-frozen-guard` and follow its recovery instructions. Do not attempt
   to repair it manually.
3. **Section registration is always explicit.** Create the folder under
   `agntcms/sections/`, then add two lines to `agntcms/config.ts`. No codegen,
   no folder scanning.
4. **Content edits go through `content/` JSON files** using native file tools.
   Always follow the skill workflow — skills encode the correct draft/publish
   sequence and prevent silent data loss.

## Project zones

**Frozen zone** — framework-owned, do not modify:
`app/api/agntcms/`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`,
`.claude/settings.json`, `.claude/skills/`

**User-editable defaults** — ship as working defaults, customize freely:
`app/sitemap.ts` (sitemap generator — reads site-meta + listPages),
`app/robots.ts` (robots.txt generator — reads site-meta for base URL)

Note: `.claude/launch.json` is a per-developer harness file (Claude Code preview/dev-server
launch config) — it is NOT frozen and is gitignored.

**User zone** — section definitions and framework config:
`agntcms/config.ts`, `agntcms/sections/`

**Content zone** — page data, drafts, version history:
`content/`

**Assets** — content-addressed image files:
`public/assets/` (filenames are SHA-256 hashes — do not rename them)

**Styles zone** — design tokens and Tailwind theme:
`styles/globals.css`, `styles/theme.css`, `styles/typography.css`

## Developer skills

These skills are your primary reference. Check this list before every operation.
Skills are installed in `.claude/skills/` and loaded with the `/` command.

**Project setup**
- `agntcms-init-from-artifact` — first-run setup: wipe the demo, copy source styles verbatim, create sections from the source markup, populate every content page, update globals, write BRAND.md
- `agntcms-structure` — canonical project layout and zone rules

**Section development**
- `agntcms-sections` — two-step workflow for creating and registering a section
- `agntcms-section-new` — scaffold a new section from a name and field list (folder, schema, component, config registration)
- `agntcms-section-validate` — validate section structure and config registration

**Content operations**
- `agntcms-content-fs` — edit content through native file tools (FS adapter); covers the draft/publish file layout

**Page lifecycle**
- `agntcms-create-page` — create an empty page draft and return a preview URL
- `agntcms-delete-page` — delete a published page after explicit editor confirmation
- `agntcms-publish-draft` — publish a draft via the framework endpoint; never move files manually
- `agntcms-unpublish-page` — take a published page offline while preserving content as a draft
- `agntcms-rollback` — roll a published page back to a previous version snapshot
- `agntcms-rename-slug` — atomically rename a page slug across pages, drafts, and history
- `agntcms-reorder-sections` — reorder sections within a draft page with disambiguation support

**Site-wide content**
- `agntcms-globals` — site-wide content blocks (header, footer, announcement bar) rendered via GlobalSlot

**Infrastructure**
- `agntcms-frozen-guard` — detect and recover from frozen-file drift
- `agntcms-git-publish` — commit conventions for content changes

## Content editing

Content operations — creating pages, editing content, publishing drafts, renaming slugs,
reordering sections, rollback — are handled through the skills listed above. Load the
relevant skill before acting. Use your native file tools to read and write JSON files
in `content/` — that is the authoritative content store.

When reporting a content change to the user, include the preview URL so they can verify
the result in the admin panel.

## Debugging discipline

- **Hypothesis before fix.** Before changing code to fix a visual or functional
  bug, state one explicit hypothesis — which CSS property, which component,
  which field schema — and verify it (read the code, inspect devtools, open the
  preview URL). Do not try CSS properties "just to see" — that is how three
  wrong fixes land before the real one.
- **Verify before explore.** When asked "check that X matches Y" (styles vs.
  `BRAND.md`, config registry vs. `agntcms/sections/` folder, etc.), diff
  first. If it already matches, stop and report "aligned, no changes needed".
  Do not open unrelated files or propose refactors.
