---
name: agntcms-init-from-artifact
user-invocable: true
description: Migrate an existing app generated from a Claude artifact (real source code + CSS) into an agntcms project, reusing the source styles and markup verbatim and wrapping them in the content model; screenshots used only to verify.
---

# agntcms Init From Artifact

Migrates an existing app generated from a Claude artifact (React, Vue, plain HTML, etc.)
into an agntcms project. The source already has correct, working styles and markup — the
job is to wrap that design inside the CMS content model, not to recreate it.

**Primary workflow: copy source code → reuse it directly.**
Screenshots are used at the end to verify, not to drive implementation.

---

## Hard rules

1. **Skills first.** Load required skills before touching any content, section,
   or frozen file.
2. **Never modify frozen zone files.** The frozen zone is:
   `app/api/agntcms/`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`,
   `.claude/settings.json`, `.claude/skills/`.
   If any step appears to require touching these, stop and report a framework constraint.
   (`app/sitemap.ts` and `app/robots.ts` are user-editable defaults, not frozen.)
3. **Section registration is always explicit** — two lines in `agntcms/config.ts`.
   No codegen, no folder scanning.
4. **Content edits go through `content/` JSON files** via native file tools.

---

## When to load

Load this skill when the user says:
- "migrate this project to the CMS", "port this site", "bring this design
  into agntcms", or any close variation.
- The source is an app generated from a Claude artifact — a file path or running
  local dev server containing real source code (JSX, HTML, CSS).

---

## What this skill does NOT do

- Does not modify frozen-zone files (see Hard rules above).
- Does not run `pnpm dev`, `pnpm build`, `pnpm test`, or commit to git.
- Does not change the *schemas* of pre-existing section types. Only their `data`
  values in content JSON are adjusted. TypeScript code in existing
  `agntcms/sections/` folders is untouched.
- Does not build per-item templates (e.g. `blog/article.html`) — those become
  dynamic routes implemented separately when the route is added.
- Does not bump versions or commit — the lead handles release coordination.

---

## Step 0 — Load required skills

**This step is blocking. Do not start Step 1 until every skill on this list is
confirmed loaded.**

Before reading a single project file or running any command, load all of the
following skills:

- `/agntcms-structure` — canonical project layout and zone rules; load first
- `/agntcms-sections` — two-line registration invariant
- `/agntcms-content-fs` — FS-adapter rules for all content JSON writes
- `/agntcms-section-new` — section scaffolding; owns the creation path; required before Step 4
- `/agntcms-create-page` — slug rules, reserved-slug rules, SEO-mandatory rule; required before Step 5
- `/agntcms-globals` — site-wide content blocks
- `/agntcms-frozen-guard` — frozen-zone drift detection

These skills contain invariants that this skill is obligated to follow — the
two-line section registration, slug validation, reserved slugs (`404`, `500`),
SEO-mandatory fields. This skill does not re-implement these rules; it inherits
them from the skills that own them.

If any skill on this list is not yet loaded, load it now. Do not proceed to
Step 1 until the list is complete.

---

## Step 1 — Wipe demo content

Check whether the project is still in the original demo state by looking for
three signals:

1. Read the first heading of `BRAND.md`. If it is `# agntcms, Brand Guide`,
   the brand file is the original demo brand.
2. Read `content/pages/home.json`. If `seo.title` contains `agntcms`, the
   home page is the original demo page.
3. Check `agntcms/config.ts` for the presence of at least two of these imports:
   `Problem`, `HowItWorks`, `OpenSource`, `WhatsBuilt`, `GettingStarted`.
   These sections exist only in the agntcms marketing demo.

If **two or more signals** are present, this is a demo project. Proceed
directly to the wipe.

If **fewer than two signals** are present (project already partially
personalized), show:

```
This project no longer looks like the original agntcms demo. Running
agntcms-init-from-artifact will overwrite your current brand, all page content,
and globals. Any customisation you have already made will be lost.

Are you sure you want to continue? (yes / no)
```

Wait for "yes" before continuing.

### Wipe operations

Perform all of the following in order:

1. **Reset `content/pages/home.json`** to a minimal valid empty home page:
   `slug: "home"`, `sections: []`, generic seo placeholders (title and
   description will be overwritten in Step 5).

2. **Delete demo blog content** — delete `content/pages/blog.json` and the
   `content/pages/blog/` directory if either is present.

3. **Reset globals** — reset `content/globals/site-header.json` and
   `content/globals/site-footer.json` to minimal valid empty globals (correct
   shape per the `agntcms-content-fs` skill, no demo copy).

4. **Reset `content/globals/site-meta.json`** to a minimal valid placeholder
   (real values come from Step 5):
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
   This clears the demo's `siteName: "agntcms"` and `baseUrl: "https://agntcms.dev"`
   so they cannot leak into generated metadata while the rest of the init runs.

5. **Remove announcement** — delete `content/globals/announcement.json` and
   remove the `<GlobalSlot name="announcement" ...>` line from `app/layout.tsx`.
   The rest of `app/layout.tsx` is left untouched; it is user zone, not frozen zone.

6. **Deregister marketing-only sections from `agntcms/config.ts`** — for each of
   `Problem`, `HowItWorks`, `OpenSource`, `WhatsBuilt`, `GettingStarted` that is
   currently registered:
   - Remove the `import { X } from './sections/X'` line.
   - Remove the identifier from the `sections: [...]` array.
   Both lines must be removed together. After each removal the two-line invariant
   must hold: every import has a corresponding array entry and vice versa.
   Do NOT delete the folders under `agntcms/sections/`. Deregistering is reversible;
   deletion is not.

7. **Reset `BRAND.md`** to a one-line stub (will be filled in Step 7):
   `# <Project Name> — Brand Guide`

---

## Step 2 — Copy the source CSS into the CMS project

This is the foundation of the whole migration. The app generated from the Claude
artifact already defines the correct colors, fonts, typography scale, layout
utilities, and component classes in its stylesheets. Reuse them directly.

1. **Find all CSS files** in the source project. Common locations:
   `css/`, `src/styles/`, `public/css/`, inline in a global component.
   Read each one.

2. **Copy each stylesheet** into the CMS project under `styles/`:
   ```
   styles/source-tokens.css      ← design tokens / colors_and_type.css
   styles/source-components.css  ← component classes / newspaper.css
   ```
   Preserve content exactly — do not rewrite, summarize, or convert to Tailwind.

3. **Import them** in `styles/globals.css` after the Tailwind import:
   ```css
   @import "tailwindcss";
   @import "./theme.css";
   @import "./source-tokens.css";
   @import "./source-components.css";
   ```

4. **Migrate design tokens** from the source token file into `styles/theme.css`:

   **Token migration rules — no exceptions:**
   - Copy every `--variable: value` line verbatim into `:root {}`. Never round
     numbers. Never rename variables. Never convert hex to rgb.
     `--paper: #FAF7F2` stays `--paper: #FAF7F2`.
   - Cover every variable family present: color neutrals, color brand/accent,
     semantic aliases, font families, type scale, line heights, letter spacing,
     spacing, radii, shadows, motion, layout widths.
   - Token variables (`--paper`, `--teal`, `--fs-base`, etc.) belong in a
     `:root { }` block outside `@theme { }`. The `@theme { }` block maps tokens
     to Tailwind utility names and must stay intact. If new tokens should be
     available as Tailwind utilities, extend the existing `@theme` mappings with
     new entries — do not restructure the block.
   - If `styles/theme.css` already contains a token name the source does NOT
     define, leave its existing value and add an inline comment
     `/* not in source — kept from template default */`. Record these names for
     the final report.

   After applying: run `grep -rE '#[0-9a-fA-F]{3,6}' styles/` and verify the
   matches are only token definition lines (the `:root` block). If a hex value
   leaked into a utility class or elsewhere, fix it.

   This lets section components use Tailwind utilities AND raw source classes.

5. **Load fonts.** The source likely imports Google Fonts via `@import url()`.
   This does NOT work through PostCSS/Tailwind — the URL never reaches the browser.
   Instead, load the same fonts in `app/layout.tsx` via `next/font/google`:

   ```tsx
   // app/layout.tsx
   import { Bodoni_Moda, PT_Serif, Oswald, Space_Mono, UnifrakturCook } from 'next/font/google'
   const bodoniModa = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni-moda', display: 'swap' })
   // ... same for others
   // Apply: <html className={`${bodoniModa.variable} ...`}>
   ```

   Then in `styles/theme.css` reference the next/font CSS variable:
   ```css
   :root { --font-display: var(--font-bodoni-moda, 'Bodoni Moda'), serif; }
   @theme { --font-display: var(--font-bodoni-moda, 'Bodoni Moda'), serif; }
   ```

   Remove any `@import url('https://fonts.googleapis.com/...')` lines from
   the copied CSS files — the fonts are now loaded via next/font instead.

---

## Step 3 — Identify sections and pages

Read the source project's component files to understand the page and section
structure. Do NOT infer structure from screenshots — read the actual JSX/HTML.

For each component/page, identify:
- **What renders as a single visual block** → one section type
- **What is site-wide** (header, footer) → globals
- **What repeats across pages unchanged** → reuse the same section type

Produce an explicit inventory:
```
Pages:  home, how-it-works, classifieds, newsroom
Globals: SiteHeader (PageHead component), SiteFooter (Footer component)
New section types:
  NewspaperHero   — lead story block (kicker, headline, dek, byline, body, caption)
  StoriesGrid     — 3-column secondary stories
  ProcessSteps    — numbered step list
  CTABand         — dark ink CTA strip
  ClassifiedAds   — want-ad columns
  PaperStats      — stats box + CTA panel
Reused: PricingPlans (pricing tiers), TeamGrid (staff masthead)
```

State this inventory explicitly so the user can confirm before coding starts.

---

## Step 4 — Create section components using source CSS classes

For each new section type, the workflow is:

1. **Read the source component** (the actual JSX/TSX/HTML) for this block.
2. **Create the section** via `/agntcms-section-new` with the right field types.

   **Execute `/agntcms-section-new` for every new section type. This is not
   optional and not skippable — `/agntcms-section-new` is the only permitted
   path for creating a section folder. Do not scaffold `agntcms/sections/<Name>/`
   by hand under any circumstances.**

   Pass it:
   - The PascalCase name you chose (e.g. `NewspaperHero`, `StoriesGrid`).
   - The field list derived from the block's content needs:
     - Free-form text or markdown → `RichTextField`
     - Short plain string → `TextField`
     - A URL + label pair → `LinkField`
     - An array of structured items → `ListField` with an `_id` field per item
     - An image → `ImageField`
     Pick only fields the block genuinely needs. Do not add fields speculatively.

3. **Write the component** by:
   - Keeping the same HTML structure as the source component.
   - Using the source's CSS class names directly (`.st-screamer`, `.st-halftone`, etc.)
     since the source CSS is now available in the CMS project (Step 2).
   - Replacing hardcoded text/data with `EditableText`, `EditableRichText`,
     `EditableList`, etc.
   - Replacing inline `style={{ color: 'var(--signal)' }}` with equivalent
     Tailwind tokens or keeping the CSS variables since they are now in `:root`.

4. **Register** in `agntcms/config.ts` via the two-line invariant.

**De-duplication rule:** if two different pages need the same block shape (e.g.
both home and contact have a Hero), that is a single section type. Create it
once, register it once, reuse it in both pages' JSON. Never create two section
types with identical field signatures just because they appear on different pages.

### Source CSS class reuse rule

If the source has `.st-screamer { font-family: ...; font-size: clamp(...); ... }`,
then `<div className="st-screamer">` in the CMS component is correct and preferred
over attempting to replicate those styles with Tailwind utility classes.
Tailwind utilities are for layout (flex, grid, padding, etc.) and for tokens not
covered by the source CSS. **Do not convert source classes to Tailwind unless the
source class does not exist in the copied CSS.**

### EditableRichText instead of hardcoded text

The source renders text like:
```jsx
<h1 className="st-screamer">{headline}</h1>
<p className="st-dek">{dek}</p>
```

The CMS component renders:
```tsx
<EditableRichText field={headline} className="st-screamer [&_h1]:m-0" />
<EditableRichText field={dek} className="st-dek" />
```

The source's CSS class provides all the typography — the CMS component just
applies it and wraps the field in the editable component.

### Global components (SiteHeader, SiteFooter)

The source's header/footer components (`PageHead`, `Footer`) should be
directly ported into the `SiteHeader`/`SiteFooter` agntcms components:
- Keep the same HTML structure.
- Replace hardcoded nav links with `EditableList` over `navItems`.
- Replace the wordmark text with `EditableText field={brandName}`.
- Hardcode any truly static elements (folio strip text, registration marks,
  edition info) that are not editorial content and would never need to change
  via the CMS.
- Static decorative CSS effects (watermarks, halftone overlays, misregistration
  shadows) stay hardcoded in the component — they are design, not content.

### After all blocks across all pages are mapped

Read `agntcms/config.ts` back and verify: every `import` statement has a
matching entry in `sections: [...]` and vice versa. If the counts differ, fix
the mismatch before continuing.

---

## Step 5 — Populate page JSONs and globals

**Before writing any page JSON:** confirm `agntcms-create-page` is loaded.
This skill does not call its HTTP endpoint — it bulk-writes published pages
directly, not drafts — but the rules that skill owns apply here unchanged as
inherited contract:

- Slug must be lowercase kebab-case, no leading slash, no trailing slash.
- Reserved slugs `404` and `500` must never be used as content-page slugs.
- Alias names (`not-found`, `error`) are not valid slugs.
- SEO fields (`seo.title` and `seo.description`) are mandatory on every page —
  empty strings are not acceptable.

**Use `/agntcms-content-fs` (the FS-adapter rules) when writing to
`content/pages/<slug>.json` and `content/globals/*.json` — do not bypass its
conventions.**

Write `content/pages/<slug>.json` for each page with:
- Content lifted verbatim from the source component's hardcoded strings.
- Every section in document order.
- `seo.title` and `seo.description` mandatory and non-empty.

**File shape for each page:**

```json
{
  "slug": "<slug>",
  "seo": {
    "title": "<lifted from source component's title or hero headline>",
    "description": "<lifted from source component's description or hero body copy>"
  },
  "sections": [
    ...one entry per block, in the order they appear in the source...
  ]
}
```

For each section entry:
- `"id"`: stable, lowercase, kebab-case — `"hero-1"`, `"features-1"`,
  `"newshero-1"`; append `-2`, `-3` if the same type appears more than once
  **on the same page**. IDs are page-scoped.
- `"type"`: the section type name exactly as registered in `config.ts`.
- `"data"`: every field populated with copy **lifted verbatim from the source
  component's hardcoded strings**. Do not paraphrase. Do not invent. Markdown
  is allowed in `RichTextField` values. `TextField` values are plain strings.

Write `content/globals/site-header.json`, `site-footer.json`, `site-meta.json`
with content from the source's header/footer components.

For `content/globals/site-meta.json`:
- `siteName`: use the source's title tag, og:site_name, or home-page hero's
  primary headline. Strip any tagline suffix separated by `|` or `—`.
- `baseUrl`: leave `null` unless the source explicitly states a production URL.
- `defaultOgImage`: set only if the source provides an explicit OG image.
  Otherwise `null`.
- `defaultDescription`: use the source's meta description or the home-page
  hero's subhead (one sentence, no markdown).

Before writing each file, verify: every `"type"` value is registered in
`agntcms/config.ts`. If any is not, that is a Step 4 error — go back and
register it.

---

## Step 6 — Visual verification pass

Only now use screenshots to confirm the result matches the source.

1. Screenshot every page in the CMS.
2. Screenshot the same pages in the source dev server (if running locally).
3. Compare side by side.
4. For any visual mismatch: identify the specific CSS property or layout rule
   that differs, fix it in the component, screenshot again.

Since components reuse the source CSS classes directly, most mismatches will be:
- A missing CSS class (add it to the component's className)
- A missing wrapping element (add the right HTML structure)
- A font not loading (verify `next/font` variables are wired correctly)
- A Tailwind utility overriding a source class (add `!` prefix or use source
  class exclusively)

---

## Step 7 — Update BRAND.md and validate

Update `BRAND.md`:
```
# <Project Name> — Brand Guide

Design source: <path to source project>

Styles live in:
  styles/source-tokens.css     — design tokens (copied from source verbatim)
  styles/source-components.css — component classes (copied from source verbatim)

Rules:
1. Use source CSS classes directly in component className props.
2. Use Tailwind utilities only for layout and for tokens not in the source CSS.
3. Never hardcode hex values — use CSS custom properties from source-tokens.css.
4. Use preview_screenshot on both the source and CMS servers to verify changes.
```

Then confirm all of the following before reporting done:

1. None of the five marketing-only sections (`Problem`, `HowItWorks`,
   `OpenSource`, `WhatsBuilt`, `GettingStarted`) remain in
   `agntcms/config.ts` — import lines and array entries both gone.
2. `BRAND.md` contains the source project path.
3. None of the frozen-zone files were modified during this run:
   `app/api/agntcms/`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`,
   `.claude/settings.json`, `.claude/skills/`.
4. `agntcms/config.ts` registry symmetry: import count equals
   `sections: [...]` entry count. Every import name appears in the array
   and vice versa.
5. For every page identified in Step 3, `content/pages/<slug>.json` exists.
   Check each slug — missing files must be created before proceeding.
6. Every `"type"` value in every `content/pages/<slug>.json` is registered
   in `agntcms/config.ts`. Iterate over every page file.
7. `styles/theme.css` contains the token variable names from the source token
   file — sample-check the color tokens and at least two type-scale tokens to
   confirm they are present.
8. `grep -rE '#[0-9a-fA-F]{3,6}' agntcms/sections/` matches only inside SVG
   markup or comments — not as styling values. Fix any leaks found.
9. `content/globals/site-meta.json` exists and its `data.siteName` is a
   non-empty string and `data.defaultDescription` is a non-empty string.

---

## Step 8 — Final report

```
Project initialized from Claude artifact app: <source project path>.

Pages built:
  / (slug "home"):
    <id>  <type>
    ...
  /how-it-works (slug "how-it-works"):
    <id>  <type>
    ...

Section types created from the source:
  <Name> — <field signature, e.g. "headline: RichTextField, lead: RichTextField">
  ...

Section types reused from the template:
  <Name>
  ...

Globals updated: site-header, site-footer.
<If header/footer differed across pages: note which page's version was used and what differed.>

Tokens migrated to styles/theme.css.
Tokens kept from template defaults (not in source): <list, or "none">.
Source CSS copied verbatim to:
  styles/source-tokens.css
  styles/source-components.css

Next steps:
  1. pnpm dev — start the dev server
  2. http://localhost:3000 — see the home page
  3. http://localhost:3000/<other-slug> — see the other pages
  4. http://localhost:3000/admin — open the editor to refine copy and structure
```

---

## Key principle: source code is the source of truth

| Decision | Wrong | Right |
|---|---|---|
| Typography | Guess Tailwind classes from screenshot | Copy source CSS file, use `.st-h1` etc. |
| Colors | Hardcode `#FF2D6F` | Copy `--signal: #FF2D6F` to `:root`, use `text-signal` |
| Font loading | `@import url(google.com/...)` in CSS | `next/font/google` in `app/layout.tsx` |
| Component structure | Rewrite from scratch | Port source JSX, replace text with editable fields |
| Verification | Trust code review | Screenshot source + CMS side by side |

## Key rules

1. **Frozen zone is immutable.** The canonical frozen paths (`app/api/agntcms/`,
   `app/[[...slug]]/page.tsx`, `app/not-found.tsx`, `.claude/settings.json`,
   `.claude/skills/`) may not be modified. `app/layout.tsx` is user zone
   (announcement removal is fine). `app/sitemap.ts` and `app/robots.ts` are
   user-editable defaults — they may be touched if the task genuinely requires it.

2. **Section registration is two lines.** Adding or removing a section means
   touching both the `import` line and the `sections: [...]` array entry. One
   without the other is an error.

3. **Do not delete section folders.** Only deregister from `config.ts`. The
   folders serve as reference and the deregistration is reversible.

4. **Do not change section schemas of pre-existing types.** This skill creates
   new section types and edits content JSON. It does not modify TypeScript code
   in existing section folders.

5. **Copy comes from the source, not from invention.** If a field has no text in
   the source component, use a one-word contextual placeholder. If the text is in
   the source, lift it verbatim.

6. **No hardcoded values in component code.** Colors and sizes come from Tailwind
   utilities backed by theme tokens. `#FAF7F2` never appears in a component file;
   `bg-[--paper]` or the equivalent Tailwind utility does.

7. **One full pass, then report.** Do not deliver partial results. Either all
   eight steps complete or nothing is written. If a step cannot complete, stop at
   that step and report the exact blocker.

8. **Section types are shared across pages.** A type created for the home page is
   available on all other pages. Never create a duplicate type because it appears
   on a different page.
