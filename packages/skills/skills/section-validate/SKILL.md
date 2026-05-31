---
name: agntcms-section-validate
user-invocable: true
description: Validates section integrity: file structure, config registration, type consistency, and editability.
---

# agntcms Section Validate

Load the `agntcms-structure` and `agntcms-sections` skills before this one. This skill
covers the full section validation flow: resolving targets, checking structure, verifying
registration, running typecheck, and auditing editability.

---

## When to use this skill

Use this skill when:
- A developer asks to validate a section (e.g. "validate the Hero section", "check all sections", "validate sections").
- After running `agntcms-section-new`, to confirm the newly created section is complete.
- When typecheck is failing and the cause might be a broken section.

Do NOT use this skill:
- To fix section issues — this skill only reports. Fix issues by editing files directly or
  using `agntcms-section-new`.

---

## Step 1: Resolve target sections

**Single section**: the developer names a specific section (e.g. "validate Hero", "check TextBlock").
- Locate `agntcms/sections/<Name>/`.
- If the folder does not exist, check `agntcms/config.ts` for a registration with that name.
  If found in config but not on disk → orphan registration (report as error).
  If not found anywhere → stop: "Section '<Name>' not found in agntcms/sections/ or config.ts."

**All sections** ("all", "everything", or no specific name given):
- Read `agntcms/config.ts`.
- Extract all section names from the `sections: [...]` array. A section name is the identifier
  in the array (e.g. `Hero`, `TextBlock` in `sections: [Hero, TextBlock]`).
- Also scan `agntcms/sections/` for any folders that are not registered — these are orphan
  folders (report as warnings).
- Validate each extracted name individually using Steps 2–4.

---

## Step 2: Structural integrity (per section)

Check that all three required files exist:

- `agntcms/sections/<Name>/index.ts`
- `agntcms/sections/<Name>/schema.ts`
- `agntcms/sections/<Name>/component.tsx`

For each missing file, record an **error**: "missing <filename>".

Check registration in `agntcms/config.ts`:

1. There must be a line matching `from './sections/<Name>'` in the imports.
2. `<Name>` must appear in the `sections: [...]` array.

If either is absent, record an **error**: "not registered in config.ts" or "import missing
from config.ts".

**Orphan detection** (both directions):
- Folder exists, no registration → **error**: "folder exists but not registered in config.ts"
- Registration exists, no folder → **error**: "registered in config.ts but folder agntcms/sections/<Name>/ not found"

---

## Step 3: Schema–component type consistency

Run `pnpm typecheck` once for the entire project (not per-section — a single run catches all
issues and is faster):

```bash
pnpm typecheck
```

If typecheck passes: record ✓ for type consistency for all sections being validated.

If typecheck fails: examine the error output. For each section being validated, check whether
any error references files inside `agntcms/sections/<Name>/`. If yes, record an **error**
for that section and include the relevant TypeScript error lines in the report.

TypeScript's generic constraint in `defineSection` enforces that the component's `Props`
interface exactly matches the schema keys, so typecheck failure in section files reliably
indicates a schema/component mismatch.

---

## Step 4: Editability check (per section)

Since v0.2, type-level enforcement (via `EditableSlot<K, V>` in `Props`) catches missing
wrappers at typecheck time. A section component that renders a field without an `<EditableX>`
wrapper produces a TypeScript error at that exact JSX call site naming the field. Step 3's
`pnpm typecheck` is therefore the primary editability gate.

This step remains as a **sanity scan** for hand-edited code or older sections that predate the
slot contract. It is informational — warnings here may indicate legacy patterns or intentional
choices, not broken sections. Step 3 (typecheck) is authoritative.

This step is a heuristic text search — it is not AST analysis. False positives are acceptable.

For each section being validated:

1. Read `agntcms/sections/<Name>/schema.ts`. Extract field names and their types by scanning
   for lines of the form `<fieldName>: <Type>,` or `<fieldName>: <Type>` inside the `schema`
   object literal.

2. Read `agntcms/sections/<Name>/component.tsx` as plain text.

3. For each field with type `TextField` or `RichTextField`:
   - Check that `EditableText` appears somewhere in the component file.
   - Check that the field name also appears somewhere in the component file.
   - If either is missing, record a **warning**: "field '<fieldName>' (TextField) is not wrapped in
     EditableText — it will not be editable through the UI."

4. For each field with type `ImageField`:
   - Check that `EditableImage` appears somewhere in the component file.
   - Check that the field name also appears somewhere in the component file.
   - If either is missing, record a **warning**: "field '<fieldName>' (ImageField) is not wrapped in
     EditableImage — it will not be editable through the UI."

5. For each field with type `LinkField`:
   - Check that `EditableLink` appears somewhere in the component file.
   - If missing, record a **warning**: "field '<fieldName>' (LinkField) is not wrapped in EditableLink."

6. For each field with type `BooleanField`:
   - Check that `EditableBoolean` appears somewhere in the component file.
   - If missing, record a **warning**: "field '<fieldName>' (BooleanField) is not wrapped in EditableBoolean."

7. For each field with type `NumberField`:
   - Check that `EditableNumber` appears somewhere in the component file.
   - If missing, record a **warning**: "field '<fieldName>' (NumberField) is not wrapped in EditableNumber."

8. For each field with type `SelectField`:
   - Check that `EditableSelect` appears somewhere in the component file.
   - If missing, record a **warning**: "field '<fieldName>' (SelectField) is not wrapped in EditableSelect."

9. For each field with type `ListField`:
   - Check that `EditableList` appears somewhere in the component file.
   - If missing, record a **warning**: "field '<fieldName>' (ListField) is not wrapped in EditableList."

10. For fields with type `ReferenceField`: skip. No editable wrapper is expected for ReferenceField fields in v1.

Warnings are not errors. A field without an editable wrapper still renders; it simply cannot
be edited through the inline UI. The developer may have intentionally chosen not to make a
field editable.

---

## Step 4b: Tailwind anti-pattern scan (per section)

Statically scan `agntcms/sections/<Name>/component.tsx` for three common Tailwind mistakes
that compile without error but break at runtime. This is a text search, not AST analysis.

### 4b-1. Dynamic Tailwind class-name interpolation (BLOCKING)

Grep for any JSX element with a `className` attribute that contains a Tailwind utility
prefix immediately followed by a template-literal interpolation:

```bash
grep -nE "className=[^>]*[a-z][a-z-]*-\\\$\\{" agntcms/sections/<Name>/component.tsx
```

The middle character class `[a-z][a-z-]*` matches 1+ letters before the trailing `-`, so it
covers 1-letter Tailwind roots (`m-`, `p-`, `w-`, `h-`, `z-`) as well as longer ones
(`lg:pl-`, `text-`, `grid-cols-`).

**Scope and false positives.** The `className=` anchor narrows the scan to JSX elements that
have a className attribute; `[^>]*` then extends up to the closing `>` of the same JSX
element, not to the end of the className value. That means a stray non-class interpolation
on the same element (e.g. `<div className="…" data-foo-${id}="…">`) can also match.
False-positive matches like that are uncommon — `data-` / `aria-` attribute names rarely
interpolate a value into the name itself — but when the validator reports a finding, confirm
the match is inside the className value before treating it as a real bug.

This pattern catches constructions like `` `lg:pl-${n}` `` or `` `text-${color}-500` `` when
they appear inside `className="…"` or ``className={`…`}``. Tailwind JIT scans source text
statically at build time; a class name composed at runtime is never included in the CSS
bundle, so the style silently has no effect in production.

If any match is found: record an **error** — "dynamic Tailwind class name at line <N>:
`<matched text>`. JIT cannot detect runtime-composed class names. See 'Tailwind class and
layout pitfalls' in `agntcms-section-new` for the fix." This finding is **blocking**.

### 4b-2. `overflow-x-auto` or `overflow-x-scroll` without an `overflow-y` companion (BLOCKING)

Find every line that uses `overflow-x-auto` or `overflow-x-scroll` and is missing an
`overflow-y-*` companion on the same line. One pipeline does both halves:

```bash
grep -nE 'overflow-x-(auto|scroll)' agntcms/sections/<Name>/component.tsx | grep -v 'overflow-y-'
```

The line-scoped check assumes the `overflow-x-*` class and its companion sit in the same
className value, which is the convention everywhere in the template. If a section spreads
className across multiple lines, normalize first (`tr -d '\n'`) or inspect the
multi-line className value by hand.

If the pipeline emits any output: record an **error** — "`overflow-x-auto` without
`overflow-y-*` at line <N>. The CSS spec coerces `overflow-y` to `auto` when `overflow-x`
is set, which can produce a phantom vertical scrollbar. See 'Tailwind class and layout
pitfalls' in `agntcms-section-new` for the fix." This finding is **blocking**.

### 4b-3. Grid-item card wrappers missing `h-full flex flex-col` (NON-BLOCKING)

This pattern cannot be reliably detected from text alone — there is no canonical syntactic
marker that distinguishes a grid-item card wrapper from other divs. Do not grep for it.

Instead, emit a **soft reminder** in the report when the component contains a CSS grid layout
(`grid`, `grid-cols-`, or `gap-`) alongside card-like structures: "If this section has a
CSS grid where cards share a row, verify that each inner card wrapper has `h-full flex flex-col`
and that bottom meta content uses `mt-auto`. See 'Tailwind class and layout pitfalls' in
`agntcms-section-new` for the full pattern." This is informational — do not flag it as a
warning unless there is clear evidence of missing `h-full`.

### Reporting 4b findings

Include anti-pattern scan results in the section report alongside Steps 2–4. Use ✗ for
blocking findings and a soft note (no symbol or ℹ) for the grid-item reminder. Point the
developer to `agntcms-section-new` → "Tailwind class and layout pitfalls" for every finding.

---

## Step 4c: previewData completeness check (per section)

`previewData` is the single authored representative sample that drives both the section
picker preview card AND the insertion seed. Missing or empty `previewData` means newly
inserted sections land with bare framework placeholders. This step checks the three
structural requirements.

This step is a text/parse scan of `agntcms/sections/<Name>/index.ts`.

### 4c-1. previewData presence (BLOCKING)

Check that `previewData` appears as a key in the `defineSection({…})` call inside
`index.ts`. A simple text scan for `previewData:` in the file is sufficient.

System sections (those with `system: true` in their `defineSection` call) are exempt —
they are hidden from the picker and do not require a sample. Check for `system: true` in the
file before applying this rule.

If `previewData` is absent (and the section is not system): record an **error** —
"`previewData` is missing. Every picker-insertable section must have a representative
sample. See 'previewData contract' in `agntcms-section-new` for content quality rules."

### 4c-2. No empty top-level fields (BLOCKING)

Parse the `previewData` object from `index.ts` and check that no top-level value is:
- An empty string (`''`)
- `null` or `undefined`
- An empty array (`[]`)

If any top-level field is empty: record an **error** — "`previewData.<fieldName>` is empty.
The picker card and insertion seed both use this sample — empty fields ship empty sections."

This is a best-effort text scan; an AST parse is ideal but not required. False negatives
(empty values nested inside objects) are acceptable.

### 4c-3. ListField items: minimum 2 per list (BLOCKING)

For each top-level key in `previewData` whose value is an array literal, count the items.
If any array has fewer than 2 items: record an **error** — "`previewData.<fieldName>` has
<N> item(s). ListField fields need at least 2 real items to show meaningful structure in the
picker preview."

Exception: `BooleanField`, `NumberField`, `SelectField` values (non-list scalars) are not
subject to this check. The check applies only to keys whose value is a JSON array.

### Reporting 4c findings

Include previewData check results in the section report. Use ✗ for any blocking finding.
Point the developer to `agntcms-section-new` → "previewData contract" for guidance.

When all three 4c sub-checks pass with no system exemption: record ✓ `previewData:
complete`.
When the section is system-exempted: record ✓ `previewData: not required (system section)`.

---

## Step 5: Report

### Single section

```
Section validation report for <Name>:

✓ Structure: all 3 files present
✓ Registration: found in config.ts
✓ Types: typecheck passed
⚠ Editability: field 'subtitle' (TextField) is not wrapped in EditableText
✓ previewData: complete
✗ previewData: 'items' list has 1 item — needs at least 2

Overall: 1 warning, 1 error
```

Use ✓ for passed checks, ⚠ for warnings, ✗ for errors.

If a check has errors, list each error on its own line after the check marker:

```
✗ Structure: missing schema.ts, missing component.tsx
✗ Registration: not found in config.ts
```

### All sections

```
Section validation report:

Hero:         ✓ all checks passed
TextBlock:    ✓ all checks passed
ImageGallery: ⚠ 1 warning (field 'caption' not editable)
Footer:       ✗ 1 error (missing schema.ts)

Summary: 4 sections checked, 1 warning, 1 error
```

If there are orphan folders (exist on disk but not in config):

```
Orphan folders detected (not registered in config.ts):
  agntcms/sections/OldHero/
  agntcms/sections/Temp/
```

List orphans at the end of the report, after the summary line.

---

## Step 5b: Page JSON SEO validation

When the user asks to validate page content (not section code), also check that every
`content/pages/**/*.json` and `content/drafts/**/*.json` file has a non-empty `seo` object:

```
✗ SEO: content/pages/blog.json — missing seo.title
✗ SEO: content/pages/blog/my-post.json — seo.description is empty
```

Rules:
- `seo` must be present at the top level.
- `seo.title` must be a non-empty string (not `""`, `null`, or absent).
- `seo.description` must be a non-empty string.
- `seo.ogImage` and `seo.canonical` are optional — do not warn when absent.
- History files under `content/history/` are also typed as `Page` and must satisfy the
  same constraint. Report but do not block on history files — they are snapshots and can
  only be fixed by re-publishing the page.

Do NOT validate `content/globals/` files — globals are not Pages and have no `seo` field.
Do NOT validate `content/submissions/` files — they are `Submission` objects.

---

## Key rules

1. **Warnings are not errors.** A section with only warnings is functional — it just has
   fields that are not editable through the UI. Do not block the developer or suggest the
   section is broken.
2. **Run typecheck once.** Do not run `pnpm typecheck` separately for each section — one run
   covers all sections and produces less noise.
3. **ReferenceField fields are exempt from editability checks.** No editable wrapper is expected
   or needed for ReferenceField fields in v1. All other field types (TextField, RichTextField,
   ImageField, LinkField, BooleanField, NumberField, SelectField, ListField) should have a
   corresponding editable wrapper; their absence is a warning.
4. **Detect orphans in both directions.** A folder without registration is as problematic as
   a registration without a folder, because one wastes disk space and the other causes a
   runtime crash when the framework tries to render the missing section.
5. **Step 4 is informational.** Since v0.2, `EditableSlot<K, V>` in `Props` enforces editability
   at typecheck time — a raw `{field}` in JSX is a compile error. Step 4's heuristic scan is a
   secondary sanity check for hand-edited code, legacy sections, or patterns the text search
   cannot detect. A passing typecheck (Step 3) is the authoritative gate; Step 4 warnings that
   contradict a passing typecheck can be safely ignored.
6. **Step 4b anti-pattern findings are part of the report.** Dynamic class-name interpolation
   and bare `overflow-x-auto` are blocking errors — the section must be fixed before marking
   it valid. The grid-item `h-full` note is informational and never blocks. Always include the
   4b scan result in the final report output even when there are no findings (record ✓ or the
   soft reminder as appropriate).
7. **Step 4c `previewData` checks are blocking errors.** Missing `previewData`, an empty top-level
   field, or a `ListField` with fewer than 2 items must be fixed before the section is considered
   valid. System sections (those with `system: true`) are exempt — they are hidden from the
   picker and do not need a representative sample.
