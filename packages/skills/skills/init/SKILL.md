---
name: agntcms-init
user-invocable: true
description: Wipes the agntcms demo, acquires the Claude Design bundle, migrates tokens, then creates and registers any missing section types and builds every content page present in the bundle (home plus blog index, docs, contact, etc.) with copy lifted verbatim from the mocks. Templates for dynamic routes are reported separately.
---

# agntcms Init

Turns a freshly scaffolded agntcms project into a working site in one pass:
wipe the demo, place the bundle, read it, migrate tokens, create sections, populate
content for every page, update globals, write BRAND.md. All ten steps run to
completion before reporting done.

---

## Hard rule — always use project skills

**If you reach Step 5 without `agntcms-section-new` loaded, or reach Step 6 without `agntcms-create-page` loaded, you are doing it wrong — stop immediately and load the missing skill before continuing.**

**Before doing any task in this flow, check the project's skill list and load the relevant skill. If a skill covers the task, you MUST use it — never re-implement what a skill already does.**

The following table maps every action this skill performs to the project skill that owns it.
**Load the skill. Do not guess, do not improvise.**

| Action | Skill to load |
|---|---|
| Canonical project layout and zones | `/agntcms-structure` (load first if not already loaded) |
| Creating and registering a new section type | `/agntcms-section-new` (scaffold) + `/agntcms-sections` (registration invariant) |
| Editing content JSON — pages, globals, drafts | `/agntcms-content-fs` |
| Creating a new page draft | `/agntcms-create-page` |
| Editing a single field in a draft section | `/agntcms-text-edit` |
| Editing a single section's data (all fields) | `/agntcms-section-edit` |
| Editing every section on a page | `/agntcms-page-edit` |
| Reordering sections within a draft | `/agntcms-reorder-sections` |
| Replacing a section instance with another type | `/agntcms-section-replace` |
| Publishing a draft | `/agntcms-publish-draft` |
| Renaming a page slug | `/agntcms-rename-slug` |
| Rolling back a page or global | `/agntcms-rollback` |
| Site-wide blocks (header, footer, announcement) | `/agntcms-globals` |
| Detecting / recovering frozen-zone drift | `/agntcms-frozen-guard` |
| Commit conventions for agent edits | `/agntcms-git-publish` |
| Validating a section's structure and registration | `/agntcms-section-validate` |

**MUST NOT:** If you find yourself writing TypeScript for a new section directly, scaffolding `agntcms/sections/<Name>/` by hand, or editing content JSON without consulting the relevant skill, **stop and load the skill first**.

When a skill's instructions contradict this skill, the more specific skill wins for its own scope (e.g. `agntcms-sections` owns the two-line registration invariant; init defers to it).

---

## When to load

Load this skill when:
- The user just scaffolded a new project (`pnpm create agntcms-app`) and asks what to do next.
- The user explicitly types `/agntcms-init`.
- The user says "set up this project for me", "integrate my design", "I have a Claude Design
  export", or any close variation.

**Before running on an already-personalized project**, check whether the project is still the
demo (Step 1). If fewer than two demo signals are present, show the warning from Step 1 and
wait for an explicit "yes" before continuing.

---

## What this skill does NOT do

- Does not modify frozen-zone files. The frozen zone is:
  `app/api/agntcms/`, `app/admin/`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`,
  `app/sitemap.ts`, `app/robots.ts`, `.claude/`, `.claude-plugin/`, `.mcp.json`.
  If any step appears to require touching these, stop and report a framework constraint.

- Does not run `pnpm dev`, `pnpm build`, `pnpm test`, or commit to git.

- Does not change the *schemas* of pre-existing section types. Only their `data` values in
  content JSON are adjusted. TypeScript code in existing `agntcms/sections/` folders is
  untouched.

- Does not build per-item templates (e.g. `blog/article.html`) — those become dynamic routes
  implemented separately when the route is added.

- Does not bump versions or commit — the lead handles release coordination.

---

## Step 0 — Load required skills

**This step is blocking. Do not start Step 1 until every skill on this list is confirmed loaded.**

Before reading a single project file or running any command, load all of the following skills:

- `/agntcms-structure` — canonical project layout and zone rules; load first
- `/agntcms-sections` — two-line registration invariant
- `/agntcms-content-fs` — FS-adapter rules for all content JSON writes
- `/agntcms-section-new` — section scaffolding; owns the creation path; required before Step 5
- `/agntcms-create-page` — slug rules, reserved-slug rules, SEO-mandatory rule; required before Step 6
- `/agntcms-globals` — site-wide content blocks
- `/agntcms-frozen-guard` — frozen-zone drift detection

These skills contain invariants that init is obligated to follow — the two-line section registration, slug validation, reserved slugs (`404`, `500`), SEO-mandatory fields. Init does not re-implement these rules; it inherits them from the skills that own them.

If any skill on this list is not yet loaded, load it now. Do not proceed to Step 1 until the list is complete.

---

## Step 1 — Detect demo state and wipe

Check whether the project is still in the original demo state by looking for three signals:

1. Read the first heading of `BRAND.md`. If it is `# agntcms, Brand Guide`, the brand file
   is the original demo brand.
2. Read `content/pages/home.json`. If `seo.title` contains `agntcms`, the home page is the
   original demo page.
3. Check `agntcms/config.ts` for the presence of at least two of these imports:
   `Problem`, `HowItWorks`, `OpenSource`, `WhatsBuilt`, `GettingStarted`.
   These sections exist only in the agntcms marketing demo.

If **two or more signals** are present, this is a demo project. Proceed directly to the wipe.

If **fewer than two signals** are present (project already partially personalized), show:

```
This project no longer looks like the original agntcms demo. Running agntcms-init will
overwrite your current brand, all page content, and globals. Any customisation you have
already made will be lost.

Are you sure you want to continue? (yes / no)
```

Wait for "yes" before continuing.

### Wipe operations

Perform all of the following in order:

1. **Reset `content/pages/home.json`** to a minimal valid empty home page:
   `slug: "home"`, `sections: []`, generic seo placeholders (title and description will be
   overwritten in Step 6).

2. **Delete demo blog content** — delete `content/pages/blog.json` and the
   `content/pages/blog/` directory if either is present.

3. **Reset globals** — reset `content/globals/site-header.json` and
   `content/globals/site-footer.json` to minimal valid empty globals (correct shape per the
   `agntcms-content-fs` skill, no demo copy).

4. **Reset `content/globals/site-meta.json`** to a minimal valid placeholder (real values come
   from Step 7):
   ```json
   {
     "name": "site-meta",
     "type": "SiteMeta",
     "data": {
       "siteName": "",
       "baseUrl": null,
       "defaultOgImage": null,
       "defaultDescription": ""
     }
   }
   ```
   This clears the demo's `siteName: "agntcms"` and `baseUrl: "https://agntcms.dev"` so they
   cannot leak into generated metadata while the rest of the init runs.

5. **Remove announcement** — delete `content/globals/announcement.json` and remove the
   `<GlobalSlot name="announcement" ...>` line from `app/layout.tsx`. The rest of
   `app/layout.tsx` is left untouched; it is user zone, not frozen zone.

6. **Deregister marketing-only sections from `agntcms/config.ts`** — for each of
   `Problem`, `HowItWorks`, `OpenSource`, `WhatsBuilt`, `GettingStarted` that is currently
   registered:
   - Remove the `import { X } from './sections/X'` line.
   - Remove the identifier from the `sections: [...]` array.
   Both lines must be removed together. After each removal the two-line invariant must hold:
   every import has a corresponding array entry and vice versa.
   Do NOT delete the folders under `agntcms/sections/`. Deregistering is reversible;
   deletion is not.

7. **Reset `BRAND.md`** to a one-line stub (will be filled in Step 8):
   `# <Project Name> — Brand Guide`

8. **Reset `README.md` project description** to a one-paragraph stub that names the project
   and notes that the design bundle path will be recorded; keep the existing development
   commands section intact.

---

## Step 2 — Acquire the Claude Design bundle

Ask the user once:

```
Claude Design bundle: URL (https://api.anthropic.com/v1/design/h/<hash>) or absolute path
to an already-extracted bundle directory?
```

**URL path:**
1. `curl -L -o /tmp/agntcms-design.tar.gz <url>`
2. `gunzip -f /tmp/agntcms-design.tar.gz`
3. `mkdir -p <project-root>/design/`
4. `tar -xf /tmp/agntcms-design.tar -C <project-root>/design/`

The bundle lands at `<project-root>/design/<bundle-name>/` (the inner directory that contains
`README.md`, `chats/`, and `project/`). Record that as `BUNDLE_ROOT`.

**Local path:**
1. `mkdir -p <project-root>/design/`
2. `cp -r <user-provided-path> <project-root>/design/`

Record `BUNDLE_ROOT` the same way.

The bundle lives inside the repo (under `design/`) so that `BRAND.md` and the agent during
implementation can reference it by a stable project-relative path.

**Validate the bundle** before proceeding:
- `BUNDLE_ROOT/README.md` must contain the phrase
  `handoff bundle from Claude Design (claude.ai/design)`. This is the reliable validation
  signature.
- `BUNDLE_ROOT/project/` must exist.

If either check fails, stop with a clear message. The wipe from Step 1 is already done, but
the bundle was not registered — tell the user to provide a valid bundle and resume from Step 2.

---

## Step 3 — Read the bundle

Read the bundle fully before touching any project file. Do not start implementing
while reading — finish this step first, then act.

1. Read `BUNDLE_ROOT/README.md` end-to-end. It states that you must read chats first, then
   the primary file, then follow its imports. Execute that protocol exactly.

2. Read every file in `BUNDLE_ROOT/chats/` (skim). The chat transcripts show what the user
   was iterating on and where they landed — the final file named in the last chat is the
   authoritative primary file.

3. Read the primary design file under `BUNDLE_ROOT/project/`. For Claude Design bundles this
   is typically `index.html` plus `Home.jsx` plus `home.css`, but trust the chat signal.
   Read all three (or however many the primary file imports) top to bottom.

4. Follow every import from the primary file: each CSS file it pulls in, each component file.
   Read them all. `BUNDLE_ROOT/project/design-system/colors_and_type.css` is always in this
   set — read it end-to-end.

5. **Classify every sub-directory under `BUNDLE_ROOT/project/`.**

   For each directory (other than `design-system/`, `screenshots/`, `uploads/`):

   a. **Content page** — the directory contains `index.html`. Read its HTML and its CSS file
      end-to-end, exactly as you read the home-page mock. These pages will be built in Steps 5
      and 6.

   b. **Template** — the directory contains an HTML file whose name is NOT `index.html` (e.g.
      `article.html`, `[slug].html`, or any file that appears to represent a single-item view
      sitting alongside an `index.html` sibling). Templates correspond to dynamic-route
      patterns. Do NOT build them as content pages. Record their paths for the final report.

   c. **Non-page asset directory** — `screenshots/`, `uploads/`, and similar. Ignore.

   Read every content-page mock in full before moving on. After Step 3 you must have read:
   - The home-page mock (primary file + imports).
   - Every `index.html` in every content-page sub-directory, plus each page's CSS file.

   Record two lists:
   - **Content pages to build:** e.g. `[home, blog, docs, contact]` with their slugs (see
     slug derivation rule in Step 6).
   - **Templates found (not built):** e.g. `["blog/article.html"]`.

6. Do NOT render HTML in a browser. Do NOT take screenshots. Everything needed is in the
   source code.

7. `tweaks-panel.jsx` (if present) is a dev-only prototype tool. Ignore it entirely.

After reading, you have: all token names and values, all font families, every visible block on
every content page, the copy each block contains, the nav links, footer, and whether an
announcement bar / top strip exists.

---

## Step 4 — Migrate tokens to `styles/theme.css`

Mirror every `--variable: value` line from
`BUNDLE_ROOT/project/design-system/colors_and_type.css` into `styles/theme.css`.

**Rules — no exceptions:**
- Copy values verbatim. Never round numbers. Never rename variables. Never convert hex to rgb.
  `--paper: #FAF7F2` stays `--paper: #FAF7F2`.
- Cover every variable family present: color neutrals, color brand/accent, semantic aliases,
  font families, type scale, line heights, letter spacing, spacing, radii, shadows, motion,
  layout widths.
- Token variables (`--paper`, `--teal`, `--fs-base`, etc.) belong in a `:root { }` block
  outside `@theme { }`. The `@theme { }` block maps tokens to Tailwind utility names and
  must stay intact. If new tokens should be available as Tailwind utilities, extend the
  existing `@theme` mappings with new entries — do not restructure the block.
- If `styles/theme.css` already contains a token name the bundle does NOT define, leave its
  existing value and add an inline comment `/* not in bundle — kept from template default */`.
  Record these names for the final report.
- If `BUNDLE_ROOT/project/design-system/fonts/fonts.css` exists, replace any existing font
  `@import` in `styles/theme.css` or `styles/globals.css` with the bundle's font `@import`.
  No duplicate `@import` lines.

**After applying:** run `grep -rE '#[0-9a-fA-F]{3,6}' styles/` and verify the matches are
only token definition lines (the `:root` block). If a hex value leaked into a utility class
or elsewhere, fix it.

---

## Step 5 — Create and register section types for every content page

For each content page identified in Step 3, iterate through its visible blocks in document
order and map each block to an agntcms section type. Process all pages before writing any
code — build the complete de-duplicated set of needed section types first, then create and
register each new type once.

**De-duplication rule:** if two different pages need the same block shape (e.g. both home and
contact have a Hero), that is a single section type. Create it once, register it once, reuse
it in both pages' JSON. Never create two section types with identical field signatures just
because they appear on different pages.

**Before mapping any block:** confirm `agntcms-section-new` is loaded. Every section-type creation in this step goes through that skill — no direct file writes to `agntcms/sections/`. If you find yourself writing `agntcms/sections/<Name>/schema.ts` or `agntcms/sections/<Name>/index.ts` directly in this step, STOP — you have skipped `agntcms-section-new`. Return to it before continuing.

### Mapping process (repeat for every block across all pages, in page order)

1. **Name the block** — describe it in one phrase (e.g. "hero with headline, tagline, install
   command, and CTA row").

2. **Check registered types** — read `agntcms/config.ts`. If a registered section type
   can host this block's shape, reuse it. Record `reused: <TypeName>` and move to the
   next block.

3. **If no registered type fits, create one:**

   **Execute `agntcms-section-new` for this section type. This is not optional and not
   skippable — `agntcms-section-new` is the only permitted path for creating a section folder.
   Do not scaffold `agntcms/sections/<Name>/` by hand under any circumstances.**

   Pass it:
   - The PascalCase name you chose (e.g. `InstallPanel`, `FeatureGrid`, `FooterStrip`).
   - The field list derived from the block's content needs:
     - Free-form text or markdown → `RichTextField`
     - Short plain string → `TextField`
     - A URL + label pair → `LinkField`
     - An array of structured items → `ListField` with an `_id` field per item
     - An image → `ImageField`
     Pick only fields the block genuinely needs. Do not add fields speculatively.

   `agntcms-section-new` will create the folder, schema, component, and index files, then
   add the two registration lines to `agntcms/config.ts`. The two-line invariant (every
   import has a matching array entry and vice versa) is enforced by that skill — init defers
   to it.

4. Record the block → section type mapping for use in Step 6.

### Header, footer, announcement

These are globals, not page sections. `SiteHeader` and `SiteFooter` section types should
already be registered from the template. If they are missing, create them following the same
procedure. The announcement bar (if present in the bundle's mock) maps to an `AnnouncementBar`
type — create it if absent.

### After all blocks across all pages are mapped

Read `agntcms/config.ts` back and verify: every `import` statement has a matching entry in
`sections: [...]` and vice versa. If the counts differ, fix the mismatch before continuing.

---

## Step 6 — Populate page JSONs from the mocks

**Before writing any page JSON:** confirm `agntcms-create-page` is loaded. Init does not call its HTTP endpoint — init bulk-writes published pages directly, not drafts — but the rules that skill owns apply here unchanged as inherited contract:

- Slug must be lowercase kebab-case, no leading slash, no trailing slash.
- Reserved slugs `404` and `500` must never be used as content-page slugs.
- Alias names (`not-found`, `error`) are not valid slugs.
- SEO fields (`seo.title` and `seo.description`) are mandatory on every page — empty strings are not acceptable.

If `agntcms-create-page` is not loaded, load it now before writing any file.

**Use `/agntcms-content-fs` (the FS-adapter rules) when writing to `content/pages/<slug>.json`
and `content/globals/*.json` — do not bypass its conventions.**

For each content page identified in Step 3, build its `content/pages/<slug>.json` from
scratch using the blocks mapped in Step 5.

**Slug derivation rule:**
- Home page (`BUNDLE_ROOT/project/index.html`) → slug `"home"`.
- Sub-page (`BUNDLE_ROOT/project/<dir>/index.html`) → slug is the directory name, e.g.
  `blog/index.html` → `"blog"`, `docs/index.html` → `"docs"`, `contact/index.html` → `"contact"`.

**File shape for each page:**

```json
{
  "slug": "<slug>",
  "seo": {
    "title": "<lifted from mock's <title> or hero headline>",
    "description": "<lifted from mock's <meta description> or hero body copy>"
  },
  "sections": [
    ...one entry per block, in the order they appear in the mock...
  ]
}
```

For each section entry:
- `"id"`: stable, lowercase, kebab-case — `"hero-1"`, `"features-1"`, `"installpanel-1"`;
  append `-2`, `-3` if the same type appears more than once **on the same page**. IDs are
  page-scoped, so `"hero-1"` can appear in both `home.json` and `contact.json` independently.
- `"type"`: the section type name exactly as registered in `config.ts`.
- `"data"`: every field populated with copy **lifted verbatim from the bundle's mock**.
  Do not paraphrase. Do not invent. Markdown is allowed in `RichTextField` values — use
  heading levels appropriate to the field's role (`#` for a page-level headline, `##` for a
  section headline, plain prose for body text). `TextField` values are plain strings.

**If the mock provides text, that text goes into `data`.** Placeholders are only acceptable
for fields the mock genuinely does not supply (e.g. an image alt not mentioned in the mock)
— even then, prefer a one-word contextual placeholder over invented prose.

Before writing each file, verify: every `"type"` value is registered in `agntcms/config.ts`.
If any is not, that is a Step 5 error — go back and register it.

**For templates found (e.g. `blog/article.html`):** do not create a page JSON. They are noted
in the final report as "templates available for dynamic routes — implement when the route is
added".

---

## Step 7 — Populate globals from the mocks

**`content/globals/site-header.json`**

Lift wordmark, nav links, and any CTA button from the bundle's header block.

Nav link typing rule:
- `/foo` or `foo` (no `://`) → `{ "type": "internal", "slug": "<path>", "label": "..." }`
- URLs containing `://` → `{ "type": "external", "url": "...", "label": "..." }`

Assign stable `_id` values `"nav-1"`, `"nav-2"`, … for each nav item.

**`content/globals/site-footer.json`**

Lift columns and copyright line from the bundle's footer block.
Assign stable `_id` values: `"col-1"`, `"col-2"` for columns; `"l-<col>-<n>"` for links.

**`content/globals/announcement.json`**

Only create this file if the bundle's primary mock has an announcement bar or top strip.
Populate it from the mock copy.

If no announcement bar is present in the mock, the file was already deleted in Step 1 and
the `<GlobalSlot name="announcement" ...>` line was already removed from `app/layout.tsx`.
Nothing to do here.

**`content/globals/site-meta.json`**

Populate the placeholder written in Step 1 with values derived from the bundle:

- `siteName`: use the bundle's `<title>` tag content, `og:site_name` meta tag, or — if
  neither is present — the home-page hero's primary headline. Strip any tagline suffix
  separated by `|` or `—` (e.g. `"Acme — Fast shipping"` → `"Acme"`).
- `baseUrl`: leave `null` unless the bundle explicitly states a production URL (e.g. in a
  footer link, a canonical `<link>`, or an `og:url` that contains a real domain). Most
  Claude Design bundles do not include a production URL — `null` is the correct default.
  The user can set this later via `/agntcms-globals`.
- `defaultOgImage`: set only if the bundle provides an explicit OG image in its
  `<meta property="og:image">` tag or in the uploads directory and the bundle README calls
  it out as the default share image. Otherwise `null`. If set, use the image's filename
  from `public/` and derive a short alt string from the site name.
- `defaultDescription`: use the bundle's `<meta name="description">` content. If absent,
  use the home-page hero's subhead or lead sentence (one sentence, no markdown).

Use `/agntcms-globals` (or `/agntcms-content-fs` for the raw write path) to write the
final value — do not bypass the canonical write path.

**Header/footer divergence across pages:** if the header or footer markup differs between
pages in the bundle (different nav links, different copyright copy, etc.), use the home-page
version as the canonical source for globals and note the divergence in the final report.
Globals in agntcms are site-wide; page-specific header variations are not supported without
a layout change.

---

## Step 8 — Update `BRAND.md`

Replace the stub from Step 1 with:

```
# <Project Name> — Brand Guide

Design source: `design/<bundle-name>/`

Before any design, styling, copy, or layout work, read
`design/<bundle-name>/README.md` end-to-end and follow it. That file is the
authoritative guide for how to consume this bundle — it tells you to read
the chat transcripts first, then the primary design file under `project/`,
then to follow its imports.

Three agntcms-specific rules the bundle's README cannot know about:

1. Copy and block ordering for every page and section come from the
   bundle's HTML/JSX mocks (e.g. `design/<bundle-name>/project/index.html`,
   `Home.jsx`, sub-page mocks). Lift verbatim. Do not invent placeholder
   text. The mocks are the content source — there is no separate content
   folder.

2. Every visible block in the mocks becomes a registered agntcms section
   under `agntcms/sections/<Name>/` with two-line registration in
   `agntcms/config.ts`. Page content goes into
   `content/pages/<slug>.json` and globals into `content/globals/*.json`
   as section data — never inline a layout into a page component. If a
   block has no matching section type, stop and run `/agntcms-section-new`.

3. Tokens from `design/<bundle-name>/project/design-system/colors_and_type.css`
   go into `styles/theme.css` verbatim (no rounding, no renaming) and are
   consumed via Tailwind utility classes through the existing `@theme` block.
   Running `grep -rE '#[0-9a-fA-F]{3,6}' styles/ agntcms/` should match
   only token definition lines.

Frozen zone is off-limits throughout (see `CLAUDE.md`).
```

Also update the project `README.md` stub from Step 1 to include a one-line
"Design source: `design/<bundle-name>/`" reference in its project description paragraph.

---

## Step 9 — Validate

Confirm all of the following before reporting done:

1. None of the five marketing-only sections (`Problem`, `HowItWorks`, `OpenSource`,
   `WhatsBuilt`, `GettingStarted`) remain in `agntcms/config.ts` — import lines and array
   entries both gone.
2. `BRAND.md` contains `design/<bundle-name>/`.
3. None of the frozen-zone files were modified during this run:
   `app/api/agntcms/`, `app/admin/`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`,
   `app/sitemap.ts`, `app/robots.ts`, `.claude/`, `.claude-plugin/`, `.mcp.json`.
4. `design/<bundle-name>/README.md` exists at the recorded path, and
   `design/<bundle-name>/project/` exists.
5. `agntcms/config.ts` registry symmetry: import count equals `sections: [...]` entry count.
   Every import name appears in the array and vice versa.
6. For every content page identified in Step 3, `content/pages/<slug>.json` exists. Check
   each slug from the content-pages list — missing files must be created before proceeding.
7. Every `"type"` value in **every** `content/pages/<slug>.json` (not just home.json — all
   page JSONs) is registered in `agntcms/config.ts`. Iterate over every page file.
8. `styles/theme.css` contains the token variable names from
   `BUNDLE_ROOT/project/design-system/colors_and_type.css` — sample-check the color tokens
   (e.g. `--paper`, `--teal`, `--ink`) and at least two type-scale tokens (e.g. `--fs-base`,
   `--fs-5xl`) to confirm they are present.
9. `grep -rE '#[0-9a-fA-F]{3,6}' agntcms/sections/` matches only inside SVG markup or
   comments — not as styling values. Fix any leaks found.
10. `content/globals/site-meta.json` exists and its `data.siteName` is a non-empty string and
    `data.defaultDescription` is a non-empty string. A file with empty strings from Step 1
    means Step 7 did not complete — go back and populate it.

---

## Step 10 — Final report

```
Project initialized from Claude Design bundle: design/<bundle-name>/.

Pages built from the bundle:
  / (slug "home"):
    <id>  <type>
    ...
  /blog (slug "blog"):
    <id>  <type>
    ...
  /docs (slug "docs"):
    <id>  <type>
    ...
  /contact (slug "contact"):
    <id>  <type>
    ...

Templates found in bundle (not built — implement when the dynamic route is added):
  <list, e.g. "blog/article.html" — or "none">

Section types created from the bundle:
  <Name> — <field signature, e.g. "headline: RichTextField, lead: RichTextField, installCommand: TextField">
  ...

Section types reused from the template:
  <Name>
  ...

Globals updated: site-header, site-footer<, announcement>.
<If header/footer diverged across pages: note which page's version was used and what differed.>

Tokens migrated to styles/theme.css.
Tokens kept from template defaults (not in bundle): <list, or "none">.

Next steps:
  1. pnpm dev — start the dev server
  2. http://localhost:3000 — see the home page
  3. http://localhost:3000/blog, /docs, /contact — see the other pages
  4. http://localhost:3000/admin — open the editor to refine copy and structure on any page
```

---

## Key rules

1. **Frozen zone is immutable.** The paths listed above may not be modified. `app/layout.tsx`
   is user zone (announcement removal is fine); everything else in `app/` that is frozen stays
   untouched.

2. **Section registration is two lines.** Adding or removing a section means touching both
   the `import` line and the `sections: [...]` array entry. One without the other is an error.

3. **Do not delete section folders.** Only deregister from `config.ts`. The folders serve as
   reference and the deregistration is reversible.

4. **Do not change section schemas of pre-existing types.** This skill creates new section
   types and edits content JSON. It does not modify TypeScript code in existing section folders.

5. **Copy comes from the mocks, not from invention.** If a field has no text in the mock,
   use a one-word contextual placeholder. If the text is in the mock, lift it verbatim.

6. **No hardcoded values in component code.** Colors and sizes come from Tailwind utilities
   backed by theme tokens. `#FAF7F2` never appears in a component file; `bg-[--paper]` or
   the equivalent Tailwind utility does.

7. **One full pass, then report.** Do not deliver partial results. Either all ten steps
   complete or nothing is written. If a step cannot complete (e.g. the bundle is malformed),
   stop at that step and report the exact blocker.

8. **Section types are shared across pages.** A type created for the home page is available
   on all other pages. Never create a duplicate type because it appears on a different page.
