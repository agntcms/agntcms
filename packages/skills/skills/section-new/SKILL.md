---
name: agntcms-section-new
user-invocable: true
description: Creates a new section from name and field list: folder, schema, component, config registration.
---

# agntcms Section New

Load the `agntcms-structure` and `agntcms-sections` skills before this one. This skill
covers the full section creation flow: input validation, design planning, file generation,
and config registration.

---

## When to use this skill

Use this skill when:
- A developer asks to create a new section (e.g. "create a Hero section with a title and image", "add a TextBlock section with a body field").

Do NOT use this skill:
- To edit an existing section's schema or component — do that directly by editing the files.
- To validate section integrity — use `agntcms-section-validate` for that.

---

## Step 1: Validate inputs

### Section name

The name must be PascalCase and alphanumeric only (`[A-Z][a-zA-Z0-9]*`).

Valid: `Hero`, `TextBlock`, `ImageGallery`, `FeaturedProduct`
Invalid: `hero` (lowercase first), `text-block` (hyphen), `Image Gallery` (space), `123Block` (digit first)

If the name does not match, stop and ask the developer to provide a PascalCase name.

### Field types

Each field must have a type from the built-in set:

| Type | Description |
|------|-------------|
| `TextField` | Single-line or short text |
| `RichTextField` | Long-form text, may include markup |
| `ImageField` | Image asset (`ImageValue = { filename, alt }`) |
| `ReferenceField` | Reference to another page by slug |
| `LinkField` | Navigation link or CTA (`LinkValue` — discriminated union, see below) |
| `BooleanField` | Boolean toggle |
| `NumberField` | Numeric value (optional `min`/`max`/`step` hints) |
| `SelectField(options)` | Choice from a fixed list; call as `SelectField([{ value, label }, ...])` |
| `ListField(itemSchema)` | Ordered list of structured items; call as `ListField({ field: Type, ... })` |

`SelectField` and `ListField` are factories (not singletons) — call them with arguments.

**LinkValue shape** — `LinkValue` is a discriminated union with four branches:

```ts
type LinkValue =
  | { type: 'internal'; slug: string; label: string }
  | { type: 'external'; url: string;  label: string }
  | { type: 'email';    email: string; label: string }
  | { type: 'phone';    phone: string; label: string }
```

- `internal` — links to a page in this site by slug.
- `external` — links to an external URL.
- `email` — opens a mail client; `email` holds the address.
- `phone` — opens a dialer; `phone` holds the display-formatted number.

Use `hrefOf` and `isExternalLink` from `@agntcms/next` to render `LinkField` fields:

```tsx
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

<a
  href={hrefOf(link)}
  target={isExternalLink(link) ? '_blank' : undefined}
  rel={isExternalLink(link) ? 'noreferrer' : undefined}
>
  {link.label}
</a>
```

Never access `link.href` or `link.external` — those properties do not exist on the type.

If any field type is not in this set, stop and report which types are invalid. List the nine
valid types so the developer can choose.

### Name conflict check

Check whether `agntcms/sections/<Name>/` already exists before creating anything.

If the folder already exists:
```
Section '<Name>' already exists at agntcms/sections/<Name>/.
What would you like to do?
  1. Rename — provide a new name
  2. Overwrite — replace all three files (schema.ts, component.tsx, index.ts)
  3. Cancel — stop here

Reply with 1, 2, or 3.
```

Wait for the developer to choose before continuing. If they choose Overwrite, confirm once
more: "This will overwrite agntcms/sections/<Name>/. Are you sure?"

---

## Step 2: Design the component

Before writing any code, read two reference files:

1. **`BRAND.md`** — design philosophy, tone, visual intent, positioning. This sets the
   creative direction.
2. **`styles/theme.css`** — the `@theme` block contains all available Tailwind design tokens:
   colors, fonts, sizes, border-radii, shadows. Use only Tailwind utility classes that
   reference these tokens.

Plan the section's visual structure:
- Choose appropriate background, text, and accent colors from the semantic tokens
  (e.g. `bg-bg-primary`, `text-text-primary`, `text-brand-primary`)
- Pick heading sizes from the display scale (`text-display-lg`, `text-display-md`, etc.)
- Use `font-display` for headings, `font-body` for body text
- Apply spacing, border-radius, and shadow from the theme
- The `frontend-design` plugin is active in this project — let it guide layout
  composition, visual hierarchy, and creative choices for decisions the brand system
  does not explicitly cover

**Hierarchy:** `BRAND.md` = design intent → `styles/theme.css` = available tokens →
`frontend-design` = quality elevation for uncovered decisions.

---

## Step 3: Create the folder and three files

Create `agntcms/sections/<Name>/` with exactly three files.

### schema.ts

Import only the field types that are actually used in this section:

```ts
import { <UsedTypes> } from '@agntcms/next'

export const schema = {
  <fieldName>: <Type>,
  // one field per line, in the order the developer specified
}
```

Example for a `Hero` section with `title: TextField` and `image: ImageField`:

```ts
import { TextField, ImageField } from '@agntcms/next'

export const schema = {
  title: TextField,
  image: ImageField,
}
```

Rules:
- Import only the types that appear in the schema. Do not import `TextField` if no field uses `TextField`.
- Keep the field order exactly as the developer specified.

### Default content must be visually representative

When using the inline descriptor form to bake defaults into the schema, **the default values
must look like a finished design mockup, not like a placeholder grid**. The moment a developer
adds a section to a page and opens the admin preview, they should be able to judge the visual
immediately — empty titles or generic filler text make that impossible.

**Rule: use realistic, on-theme content for every default.** Think of it as the copy a
designer would put in a Figma frame to demonstrate the section's intent.

Banned defaults (never use these):
- `'Lorem ipsum'`, `'Placeholder text'`, `'Text here'`
- Generic structural labels: `'Heading'`, `'Title'`, `'Subtitle'`, `'Subheading'`
- Button filler: `'Button'`, `'Click here'`, `'CTA'`
- Empty image alts or stock paths: `''`, `'image.png'`, `'https://example.com/image.png'`
- Bare price stubs: `'$0'`, `'Price'`

Required: content that communicates the section's intent at a glance.

**Bad vs. good — Hero section:**
```
Bad:  title: 'Heading', subtitle: 'Subheading'
Good: title: 'Ship production sites with an AI partner',
      subtitle: 'agntcms lets Claude Code edit your content while you build. No CMS dashboard, no plugins.'
```

**Bad vs. good — Pricing section (tier list item):**
```
Bad:  name: 'Tier name', price: '$0/mo'
Good: name: 'Pro', price: '$49/mo'
```

**Bad vs. good — Testimonials section (quote list item):**
```
Bad:  quote: 'Testimonial text', author: 'Name', role: 'Role'
Good: quote: 'We shipped our landing page in a weekend. The agent handles rewrites while I focus on product.',
      author: 'Marta Kowalski', role: 'Co-founder, Loops'
```

**Bad vs. good — ImageField:**
```
Bad:  { kind: 'image' as const, default: { filename: 'placeholder.png', alt: 'Image' } }
Good: { kind: 'image' as const, default: { filename: 'hero.jpg', alt: 'Developer working at a laptop with code on screen' } }
```

Calibrate specificity to the section's domain. A generic content section can use
industry-neutral copy; a SaaS pricing section should have plausible plan names and prices.
The alt text of image defaults must describe a real scene, not just say "image" or "photo".

This rule applies to every field with a `default` property, including `ListField` item
defaults, `LinkField` defaults (`label` must be action-oriented — `'See all plans'`, not
`'Button'`), and `RichTextField` defaults (include actual markdown formatting where the
section design calls for it, e.g. `'## Why teams choose us\n\nThree reasons...'`).

---

**Mixing singleton and inline descriptor forms.** Both forms satisfy `FieldDescriptor` and can coexist in the same schema object:

- **Singleton** (`TextField`, `RichTextField`, `ImageField`, `LinkField`, …) — use when the field needs no default value. The singleton is the descriptor object itself.
- **Inline descriptor** (`{ kind: 'text' as const, default: '…' }`, `{ kind: 'richText' as const, default: '…' }`, etc.) — use when you want a default value baked into the schema so newly inserted sections start pre-filled rather than blank.

The `as const` annotation is required on the `kind` property so TypeScript narrows the literal type correctly. You may also use `satisfies TextField` (etc.) for editor autocomplete without the `as const` annotation — the template uses both styles.

Example derived from `template/agntcms/sections/Pricing/schema.ts` (top-level singletons, inline descriptors inside `ListField` items):

```ts
import { RichTextField, ListField } from '@agntcms/next'

export const schema = {
  // Singleton — no default needed; authors fill this in themselves.
  headline: RichTextField,

  tiers: ListField({
    // Inline descriptor — new tiers start pre-filled so the section
    // looks believable immediately rather than rendering blank cards.
    name: { kind: 'richText' as const, default: 'Tier name' },
    price: { kind: 'richText' as const, default: '$0/mo' },
  }),
}
```

> **`LinkField`, `ImageField`, and `VideoField` inline defaults**: all three field types support a `default` property on the inline descriptor form. See "LinkField default syntax" under the LinkField subsection below.

### component.tsx

> **Visible copy policy**: any user-visible text in a section should be modeled as
> `RichTextField` and rendered with `<EditableRichText>`. Reserve `TextField` for non-visible
> data strings only (URLs, slugs, IDs, SEO-only values, similar machine-facing content).
>
> **EditableText vs EditableRichText**: `RichTextField` fields MUST use `<EditableRichText>` —
> it renders markdown (bold, italic, links, headings, line breaks). `TextField` fields use
> `<EditableText>` (plain text only) and should not be used for visible section copy. Don't mix
> them — markdown will not render in `<EditableText>` after v0.2.
>
> **Nested-heading pitfall**: `EditableRichText` passes its content through a markdown renderer
> that emits real `<h1>`–`<h6>` tags from `# …######` markers (and `<p>` / `<pre>` /
> `<blockquote>` / `<ul>/<ol>/<li>` / `<strong>` / `<em>` / `<code>` from their respective
> markers). If you set `as="h1"` on an `EditableRichText` whose content begins with
> `# My Heading`, the DOM becomes `<h1><h1>…</h1></h1>` — invalid HTML. Always use a neutral
> wrapper (`as="div"` by default, or `as="span"` for inline contexts) on `EditableRichText`
> and apply heading/paragraph/list typography through descendant selectors:
> `[&_h1]:font-display [&_h1]:text-display-xl [&_p]:text-text-secondary`.
> Use semantic `as=` only on `<EditableText>` (plain text, no markdown emission).

Field type to editable component mapping:

| Field type | Rendered as |
|------------|-------------|
| `TextField` | `<EditableText field={fieldName} className="..." />` for non-visible data strings only |
| `RichTextField` | `<EditableRichText field={fieldName} className="prose [&_h2]:font-display ..." />` |
| `ImageField` | `<EditableImage field={fieldName} className="..." />` |
| `ReferenceField` | `{fieldName}` (no wrapper — references are not inline-editable in v1) |
| `LinkField` | See "LinkField — wrapping pattern" below |
| `BooleanField` | `<EditableBoolean field={fieldName} />` |
| `NumberField` | `<EditableNumber field={fieldName} />` |
| `SelectField` | `<EditableSelect field={fieldName} options={descriptor.options} />` |
| `ListField` | `<EditableList field={fieldName} />` (renders a card-based editor for the list items) |

Import only the editable components that are actually used (omit the import if all fields are
`ReferenceField`).

### Nested ListField — required pattern

When a `ListField` item schema itself contains another `ListField` (e.g. sidebar groups with a link list, or content sections with a step list), the inner list **must** be rendered with a nested `<EditableList>` inside the outer `renderItem`. Never call `.map()` directly on a nested list field — `field` is an `EditableSlot<'list', ...>` and is not directly iterable.

Canonical shape (derived from `template/agntcms/sections/DocsArticle/component.tsx`):

```tsx
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { read } from '@agntcms/next/client'

type OuterItem = SlotItem<typeof schema.outerField.itemSchema>

<EditableList
  field={outerItem.innerListField}          // the nested ListField slot from the parent item
  itemSchema={schema.outerField.itemSchema.innerListField.itemSchema}
  className="..."
  renderItem={(innerItem) => {
    // innerItem fields are themselves EditableSlot — pass directly to editable
    // components, or call read(innerItem.someField) for non-editable computations.
    return <div>...</div>
  }}
/>
```

Key points:
- `field` receives the nested list slot from the outer `renderItem` — pass it directly to `<EditableList>`.
- `itemSchema` drills into the schema with `.itemSchema` twice: once for the outer list and once for the inner list.
- To read a boolean/link/text from an inner item for conditional logic (e.g. `active` flag, `href`), call `read(innerItem.someField)` — item fields are `EditableSlot` values and must be unwrapped via `read` before use in non-JSX expressions.

### LinkField — wrapping pattern

`EditableLink` renders only the **label** text — a `<span>` in published mode and a
click-to-edit span in preview mode. The section component is responsible for wrapping it in
an `<a>` element so routing, `href`, and `target`/`rel` work correctly. This is an
intentional split: the editor stays out of navigation policy.

**className rule: button styling goes on `<EditableLink>`, NOT on the wrapping `<a>`.**

In published mode `EditableLink` renders `<span className={className}>label</span>`. In
preview mode it renders a clickable `<span className={className} data-agntcms-editable="link">`.
The `className` lands on the visible span in both modes — this is where Tailwind button
classes (`inline-flex`, `px-5`, `py-2.5`, `bg-…`, `rounded-…`, etc.) belong.

The wrapping `<a>` carries ONLY navigation attributes (`href`, `target`, `rel`). Do not
put visual styling on `<a>` — if you do, the click-to-edit affordance in preview mode will
not size correctly with the button visual, because the editable span and the styled element
are different DOM nodes.

This convention is confirmed in `template/agntcms/sections/Hero/component.tsx` and
`template/agntcms/sections/DocsArticle/component.tsx` — both put all visual classes on
`<EditableLink>` and leave `<a>` unstyled.

**Canonical pattern** (derived from `template/agntcms/sections/Hero/component.tsx`):

```tsx
'use client'

import { EditableLink, read } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

// Props use the slot type — TypeScript enforces that the field goes to
// <EditableLink>, not directly into JSX as a value.
interface Props {
  readonly primaryCta: EditableSlot<'link', LinkValue>
}

export function MyComponent({ primaryCta }: Props) {
  // read() unwraps the slot to the bare LinkValue for use in hrefOf() / isExternalLink().
  const cta = read(primaryCta)

  return (
    <a
      href={hrefOf(cta) || '#'}
      target={isExternalLink(cta) ? '_blank' : undefined}
      rel={isExternalLink(cta) ? 'noreferrer' : undefined}
    >
      <EditableLink
        field={primaryCta}
        className="inline-flex items-center px-5 py-2.5 ..."
      />
    </a>
  )
}
```

**Why `<a>` wraps `<EditableLink>`, not the reverse**: the section controls `href` and
`target`; `EditableLink` controls the edit affordance. If the order were reversed the
section would lose control of navigation behavior.

**When NOT to use `<EditableLink>`**: only if the link should be purely decorative and not
editable by the author. This is rare — prefer `<EditableLink>` so authors can update labels
without a code change.

**Conditional rendering with optional LinkField**: hide the CTA when its href is empty,
but keep it alive in preview so the author has a click target to open the link picker.

When the conditional wraps an `<EditableLink>` (or `<EditableImage>` / `<EditableButton>`),
the inline editor IS the author's only entry point. An unconfigured CTA has an empty href,
so `hrefOf()` alone returns `''`, the `<a>` never mounts, and the author has no way to
configure the link. The fix is the disjunction with `isSlotInPreview`:

```tsx
import { EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

const cta = read(primaryCta)
const showCta = Boolean(hrefOf(cta)) || isSlotInPreview(primaryCta)
{showCta && (
  <a href={hrefOf(cta) || '#'} target={isExternalLink(cta) ? '_blank' : undefined} ...>
    <EditableLink field={primaryCta} className="..." />
  </a>
)}
```

`isSlotInPreview(slot)` returns `true` when the slot is rendering in preview mode, keeping
the `<a>` (and the `<EditableLink>` inside it) mounted so the author can click to configure.
In published mode `isSlotInPreview` is always `false`, so the empty CTA is correctly hidden.

**When the disjunction is NOT required**: if the conditional wraps a plain `<a>` whose label
is NOT inside an editable wrapper — for example `template/agntcms/sections/Hero/component.tsx`'s
`<span>{cta.label}</span>` pattern — the author can only configure the link through the section
settings modal, not through inline click. Omitting `isSlotInPreview` is correct there; adding
it would keep a visually incomplete anchor mounted for no authoring benefit.
The disjunction is required only when the edit affordance (`<EditableLink>`, `<EditableImage>`,
`<EditableButton>`) is the author's sole entry point inside the conditional.
`template/agntcms/sections/DocsArticle/component.tsx`'s prev/next nav is the canonical
example of the disjunction in use.

**LinkField inside a ListField item**: item fields are themselves `EditableSlot` values.
Pass the slot directly to `<EditableLink>`. For the bare `LinkValue` (to compute `hrefOf`),
call `read(item.linkField)`:

```tsx
renderItem={(item) => {
  const link = read(item.ctaField)
  return (
    <a href={hrefOf(link) || '#'} target={isExternalLink(link) ? '_blank' : undefined}>
      <EditableLink field={item.ctaField} className="..." />
    </a>
  )
}}
```

### LinkField default syntax

`LinkField`, `ImageField`, and `VideoField` all support a `default` property on the inline
descriptor form. This is confirmed by the field interfaces in `packages/next/src/domain/fields.ts`:
`LinkField.default?: LinkValue`, `ImageField.default?: ImageValue`, `VideoField.default?: VideoValue`.

Use the inline descriptor to give a field a starting value when a new section is inserted:

```ts
// Link with a default — inline descriptor form
// All four LinkValue branches are valid as default values.
export const schema = {
  // Unconfigured internal link — authors fill in slug and label via the picker.
  cta: { kind: 'link' as const, default: { type: 'internal' as const, slug: '', label: 'Get started' } },

  // Pre-configured external link
  docsLink: { kind: 'link' as const, default: { type: 'external' as const, url: 'https://example.com', label: 'Read the docs' } },

  // Email link
  contact: { kind: 'link' as const, default: { type: 'email' as const, email: '', label: 'Contact us' } },

  // Phone link
  phone: { kind: 'link' as const, default: { type: 'phone' as const, phone: '', label: 'Call us' } },
}
```

`label` is required on all four branches — even when the url/slug/email/phone is intentionally
blank (authors configure those via the picker modal).

`ImageField` and `VideoField` defaults follow the same pattern:

```ts
export const schema = {
  hero: { kind: 'image' as const, default: { filename: 'placeholder.png', alt: 'Hero image' } },
  demo: { kind: 'video' as const, default: { url: '', aspectRatio: '16:9' as const } },
}
```

**No template section currently seeds a `LinkField` default** — all template sections that use
`LinkField` (CTA, AnnouncementBar, SiteHeader, SiteFooter) use the singleton form with no
default. `HowItWorks/schema.ts` is the only template section that seeds an `ImageField` default
via the inline form.

When to use each:
- **Singleton `LinkField`** (no default): for links that the author must configure before the
  section makes visual sense (e.g. a navigation CTA). The link starts unconfigured; the
  conditional-render idiom `hrefOf(read(field))` returns an empty string → element is hidden in
  published mode. In preview mode the SectionRenderer renders the component regardless, so the
  edit affordance remains visible.
- **Inline `{ kind: 'link', default: { type: 'internal', slug: '', label: '…' } }`**: for links
  that should render immediately with placeholder text, letting authors click to configure. Useful
  when "unconfigured" should be visible in the picker rather than hidden entirely.

### Heading size overrides inside EditableRichText

The prose heading rules in `styles/typography.css` are unlayered author CSS. Tailwind v4
utility overrides land inside `@layer utilities`, which the cascade spec says unlayered CSS
beats regardless of selector specificity. As a result:

```tsx
// This compiles silently but has no visual effect — the prose rule wins the cascade.
className="prose [&_h1]:text-[clamp(40px,6vw,72px)]"
```

**Fix: use the `!` prefix on font-size, line-height, and letter-spacing overrides.**
Tailwind's `!` prefix emits `!important`, which beats unlayered author CSS:

```tsx
<EditableRichText
  field={headline}
  className="
    [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-text-primary [&_h1]:m-0
    [&_h1]:max-w-[18ch]
    [&_h1]:!text-[clamp(40px,6vw,72px)] [&_h1]:!leading-[1.02] [&_h1]:!tracking-[-0.04em]
    [&_strong]:!font-medium [&_strong]:text-text-brand-primary
  "
/>
```

Apply `!` only to `font-size`, `line-height`, and `letter-spacing`. Font family, color, and
margin overrides do not collide with unlayered prose rules and need no `!`.

**ch units: attach `max-w-[Nch]` to the heading selector, not the prose wrapper.**
`ch` is the width of the `0` glyph in the element's own font. The wrapper uses `font-body`
(Inter); the heading inside uses `font-display` (Satoshi). Satoshi's `0` is ~30 % wider, so
`max-w-[18ch]` on the wrapper yields a visually narrower constraint than intended:

```tsx
// Wrong — ch in body font
className="max-w-[18ch] [&_h1]:font-display …"

// Correct — ch in display font
className="[&_h1]:max-w-[18ch] [&_h1]:font-display …"
```

For a full rationale see the "Overriding heading sizes inside `EditableRichText`" subsection
in `agntcms-sections`.

### Tailwind class and layout pitfalls

Four common mistakes that cause silent visual breakage. Each is a pattern-level error — it
compiles cleanly but produces broken output at runtime.

#### 1. Dynamic Tailwind class-name interpolation

**Rule: never construct a Tailwind class name by interpolating a variable into a template
literal.** Write the full class string as a literal on every branch of the conditional.

**Why:** Tailwind's JIT scanner is a static text search — it looks for literal class strings
in your source files. A class assembled at runtime (`` `lg:pl-${odd ? '0' : '8'}` ``) is
invisible to the scanner, so no CSS rule is generated and the layout silently breaks.

```tsx
// Bad — JIT scanner cannot detect lg:pl-0 or lg:pl-8 here
className={`lg:pl-${odd ? '0' : '8'}`}

// Good — both full class strings are present as literals in the source
className={odd ? 'lg:pl-0 lg:pr-8' : 'lg:pl-8 lg:pr-0'}
```

The same rule applies to any computed class segment: color scales, spacing steps, grid
columns, z-index values — the entire class name must appear verbatim in the source.

#### 2. Missing `h-full flex flex-col` on grid-item card wrappers

**Rule: when cards sit inside a CSS grid row, give the inner card wrapper `h-full flex flex-col`
so heights equalize. If the section has a single short element that belongs visually at the
bottom of the card (date, byline, "Read more" link), also anchor it with `mt-auto`.**

**Why:** a CSS grid row stretches to the height of its tallest cell, but a child `<div>` only
takes up its content height unless told otherwise. The dominant card (extra badge, more copy)
makes the row tall; other cards sit at intrinsic height — their bottom border and content
float in the middle of the row instead of filling it.

```tsx
// Bad — card sits at content height; bottom border floats mid-row
<div className="rounded-xl border border-border-primary p-6">
  <EditableRichText field={item.name} ... />
  <p className="text-sm text-text-secondary">Details</p>
</div>

// Good — card fills the row height; short meta line anchors to the bottom
<div className="h-full flex flex-col rounded-xl border border-border-primary p-6">
  <EditableRichText field={item.name} ... />
  <p className="mt-auto text-sm text-text-secondary">Posted 3 days ago</p>
</div>
```

**When `mt-auto` is the right call vs. when it is not.** `mt-auto` makes sense when the
bottom element is a single short line (post meta, byline, small footer link) — pushing it
to the bottom mirrors a familiar card pattern and the gap above it varies invisibly.

`mt-auto` is **not** right when the bottom element is a substantial block (a long feature
list, a pricing breakdown, a CTA group). With those, anchoring to the bottom makes the
break-point between the upper content and the bottom block move card-to-card, which reads
worse than leaving the block at its natural y-position with empty space below it.
`PricingPlans` is the canonical example of the second case: its feature list is the bulk
of the card, so the section uses `h-full` only and lets the empty space accumulate at the
bottom of shorter cards.

`FeaturedArticles` is the canonical example of the first case: its meta line is the date
and byline, anchored to the bottom of each article card with `mt-auto`. `TeamGrid` has no
bottom-anchored element and uses `h-full flex flex-col` alone.

#### 3. `overflow-x-auto` without an explicit `overflow-y` value

**Rule: always pair `overflow-x-auto` with an explicit `overflow-y` value — typically
`overflow-y-hidden`.**

**Why:** in CSS, setting `overflow-x: auto` coerces `overflow-y` from `visible` to `auto`
(the spec does not allow the two-axis mix). If any inner element protrudes 1 px below the
content box — for example a tab button with `-mb-px` that overlaps a bottom border — a
phantom vertical scrollbar appears.

```tsx
// Bad — overflow-y silently becomes 'auto'; phantom scrollbar can appear
<div className="overflow-x-auto">...</div>

// Good — both axes are explicit
<div className="overflow-x-auto overflow-y-hidden">...</div>
```

Choose the `overflow-y` value that the design actually needs from the values that *can*
take effect once `overflow-x` is set: `overflow-y-hidden`, `overflow-y-scroll`,
`overflow-y-auto`, or `overflow-y-clip`. **Do not write `overflow-y-visible`** — the spec
forbids one-axis-`visible` / other-axis-non-`visible`, so the browser silently rewrites it
to `auto` and the declaration is inert.

#### 4. Interactive elements without hover or active feedback

**Rule: every clickable element — `<button>`, `<a>` used as a button or tab, pagination
controls, segmented controls, filter chips, sort headers — must have a visible hover state
plus `cursor-pointer` and `transition-colors`.** When the element has an active/inactive
distinction (tabs, segmented controls), the inactive state's hover should foreshadow the
active state (text darkens toward the active token, border appears beneath, etc.).

**Why:** static styling on a clickable element gives no signal that it responds to input.
Inactive choices in a tab strip read as decorative text; copy-buttons read as labels;
chips read as pills. The miss is especially silent when the inactive state uses a
low-contrast token (`text-text-tertiary`, `text-ink-3`) — there is no visual gradient
between "decorative" and "interactive." TypeScript and JIT don't catch this; only a manual
visual review does.

```tsx
// Bad — no hover feedback; inactive tabs look like static text
<button
  className={`border-b-2 pb-3.5 text-[15px] font-medium ${
    isActive ? 'border-ink text-ink' : 'border-transparent text-text-tertiary'
  }`}
>

// Good — hover darkens text and reveals border, mirroring the active state
<button
  className={`cursor-pointer transition-colors border-b-2 pb-3.5 text-[15px] font-medium ${
    isActive
      ? 'border-ink text-ink'
      : 'border-transparent text-text-tertiary hover:border-border-secondary hover:text-text-secondary'
  }`}
>
```

For single-state buttons (always-prominent CTA), hover must still shift one visual property
— background tint, border darken, slight color move. The rule is "hover produces a visible
change," not a specific change. Pick what fits the brand tokens.

Apply to: tabs, pagination controls, segmented controls, filter chips, "show more" buttons,
copy-to-clipboard buttons, sort headers, accordion headers, any `<button>` element, and any
`<a>` whose intent is action rather than navigation prose.

### Prop types — slot contract

Since v0.2, section component `Props` use `EditableSlot<K, V>` instead of raw value types.
`EditableSlot<K, V>` is an opaque branded type — it is **not** assignable to `ReactNode`, so
writing `{headline}` in JSX produces a TypeScript error naming the field and pointing at the
required wrapper. The type system enforces editability; a missing `<EditableX>` wrapper is a
compile error, not a silent bug.

`read(slot)` unwraps an `EditableSlot<K, V>` to the bare `V` when you need the raw value in
non-JSX code (e.g. calling `hrefOf()`, computing conditional logic, accessing `.slug`). Import
`read` from `@agntcms/next/client`.

**Prop type by field type:**

| Field type | `Props` type | Import |
|------------|-------------|--------|
| `TextField` | `EditableSlot<'text', string>` | `import type { EditableSlot } from '@agntcms/next/client'` |
| `RichTextField` | `EditableSlot<'richText', string>` | same |
| `ImageField` | `EditableSlot<'image', ImageValue>` | + `import type { ImageValue } from '@agntcms/next'` |
| `LinkField` | `EditableSlot<'link', LinkValue>` | + `import type { LinkValue } from '@agntcms/next'` |
| `BooleanField` | `EditableSlot<'boolean', boolean>` | same |
| `NumberField` | `EditableSlot<'number', number>` | same |
| `SelectField` | `EditableSlot<'select', string>` | same |
| `ListField` | `EditableSlot<'list', ReadonlyArray<SlotItem<typeof schema.field.itemSchema>>>` | + `import type { SlotItem } from '@agntcms/next/client'` |
| `ReferenceField` | `ReferenceValue` (`{ slug: string }`) | raw, no slot — not inline-editable in v1 |

`ReferenceField` stays as `ReferenceValue` — references are not inline-editable in v1, so
no slot wrapper is applied.

Rules:
- The `'use client'` directive must be the first line.
- The component function name is `<Name>Component` (PascalCase name + "Component").
- For `ReferenceField`: access the slug via `.slug`, e.g. `` <a href={`/${ref.slug}`}> ``; type it inline as `{ slug: string }` unless you need to name it.
- **No inline `style={}`** — all styling through Tailwind utility classes.
- **No hardcoded values** — use theme token classes (`bg-bg-primary`, not `bg-[#141413]`).
  Read `styles/theme.css` for the full list of available tokens.
- **Use semantic token names** — `text-text-primary` not `text-gray-200`.
- Use the `className` prop on EditableText/EditableImage for styling.
- `<EditableText>` (TextField): use `as=` for any semantic tag — `as="h1"`, `as="p"`, `as="span"`, etc. The value is plain text with no markdown parsing, so the wrapper IS the semantic element.
- `<EditableRichText>` (RichTextField): always use a neutral wrapper — `as="div"` (default) or `as="span"` for inline contexts. Never `as="h1"` / `as="p"` / `as="pre"` / `as="blockquote"` / any list tag. The markdown renderer emits those elements from the field source itself.
- Use `font-display` for headings, implicit `font-body` for body text.
- Choose heading sizes from the display scale: `text-display-2xl`, `text-display-xl`,
  `text-display-lg`, `text-display-md`, `text-display-sm`, `text-display-xs`.
- The section ships with full brand styling applied.
- Render fields in the order they were specified.

Example for a section with `headline: RichTextField`, `hero: ImageField`, `cta: LinkField`,
and `related: ReferenceField`. This covers the four main prop-type patterns in one snippet:

```tsx
'use client'

import { EditableRichText, EditableImage, EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { ImageValue, LinkValue } from '@agntcms/next'

interface Props {
  // Slot types — the type system enforces that each field is passed to an
  // <EditableX> component. Rendering {headline} directly is a compile error.
  readonly headline: EditableSlot<'richText', string>
  readonly hero: EditableSlot<'image', ImageValue>
  readonly cta: EditableSlot<'link', LinkValue>
  // ReferenceField stays raw — not inline-editable in v1.
  readonly related: { readonly slug: string }
}

export function ExampleComponent({ headline, hero, cta, related }: Props) {
  // read() unwraps a slot to the bare value for non-JSX use.
  const ctaValue = read(cta)
  // Keep the CTA slot alive in preview even when unconfigured — EditableLink
  // is the author's only click target to open the link picker.
  const showCta = Boolean(hrefOf(ctaValue)) || isSlotInPreview(cta)

  return (
    <section className="bg-bg-primary py-20 px-6 flex flex-col items-center gap-8 text-center">
      {/* RichTextField — neutral wrapper, descendant selectors for heading styles */}
      <EditableRichText
        field={headline}
        className="
          [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-text-primary [&_h1]:m-0
          [&_h1]:max-w-[18ch]
          [&_h1]:!text-[clamp(40px,6vw,72px)] [&_h1]:!leading-[1.02] [&_h1]:!tracking-[-0.04em]
        "
      />
      {/* ImageField */}
      <EditableImage
        field={hero}
        className="max-w-full rounded-xl"
      />
      {/* LinkField — disjunction keeps the slot visible in preview; hides it when empty in published mode */}
      {showCta && (
        <a
          href={hrefOf(ctaValue) || '#'}
          target={isExternalLink(ctaValue) ? '_blank' : undefined}
          rel={isExternalLink(ctaValue) ? 'noreferrer' : undefined}
        >
          <EditableLink
            field={cta}
            className="inline-flex items-center px-5 py-2.5 bg-bg-brand-solid text-text-primary_on-brand rounded-sm"
          />
        </a>
      )}
      {/* ReferenceField — raw value, access .slug directly */}
      <a href={`/${related.slug}`} className="text-text-secondary text-sm">
        View related page
      </a>
    </section>
  )
}
```

For a minimal `TextField` + `ImageField` section:

```tsx
'use client'

import { EditableText, EditableImage } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'

interface Props {
  readonly title: EditableSlot<'text', string>
  readonly image: EditableSlot<'image', ImageValue>
}

export function HeroComponent({ title, image }: Props) {
  return (
    <section className="bg-bg-primary py-20 px-6 flex flex-col items-center gap-6 text-center">
      <EditableText
        field={title}
        as="h1"
        className="font-display text-display-lg text-text-primary font-medium tracking-tighter"
      />
      <EditableImage
        field={image}
        className="max-w-full rounded-xl"
      />
    </section>
  )
}
```

For a `ListField`, derive the item type with `SlotItem` and pass item fields directly to
editable components. See also the "Nested ListField" section above for nested-list patterns:

```tsx
'use client'

import { EditableRichText, EditableList } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

// Derive item type from the schema — never write item props manually.
type TierItem = SlotItem<typeof schema.tiers.itemSchema>

interface Props {
  readonly headline: EditableSlot<'richText', string>
  readonly tiers: EditableSlot<'list', ReadonlyArray<TierItem>>
}

export function PricingComponent({ headline, tiers }: Props) {
  return (
    <section className="bg-bg-primary py-16 px-6">
      <EditableRichText
        field={headline}
        className="[&_h2]:font-display [&_h2]:text-display-lg [&_h2]:text-text-primary [&_h2]:m-0"
      />
      <EditableList
        field={tiers}
        itemSchema={schema.tiers.itemSchema}
        className="grid grid-cols-1 gap-6 mt-10 md:grid-cols-3"
        renderItem={(item) => (
          <div className="rounded-xl border border-border-primary p-6">
            {/* item fields are EditableSlot — pass directly to editable components */}
            <EditableRichText
              field={item.name}
              className="[&_p]:font-display [&_p]:text-display-md [&_p]:text-text-primary [&_p]:m-0"
            />
            <EditableRichText
              field={item.price}
              className="[&_p]:text-text-brand-primary [&_p]:text-display-sm [&_p]:m-0 mt-1"
            />
          </div>
        )}
      />
    </section>
  )
}
```

For a `RichTextField` body field, the pattern is a neutral wrapper with descendant selectors:

```tsx
<EditableRichText
  field={body}
  className="prose max-w-2xl [&_h2]:font-display [&_h2]:text-display-md [&_p]:text-text-secondary"
/>
```

### index.ts

```ts
import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { <Name>Component } from './component'

export const <Name> = defineSection({
  name: '<Name>',
  category: '<Category>',
  schema,
  component: <Name>Component,
})
```

The exported constant name is the section name exactly as provided (e.g. `Hero`, `TextBlock`).

**`category`** is a real public field on `defineSection` (type `string | undefined`). It
groups sections in the picker modal. Use one of the canonical values from the template, or
introduce a new one if the section genuinely belongs to a new group:

| Category value | Used by |
|----------------|---------|
| `'Hero'` | Top-of-page hero sections |
| `'Content'` | General content sections (TextBlock, Features, FAQ, CTA, PostList …) |
| `'CTA'` | Stand-alone call-to-action sections |
| `'Features'` | Feature-highlight sections |
| `'Social Proof'` | Testimonials and trust-building sections |
| `'Forms'` | Sections that embed a form |
| `'Layout'` | Structural / spacing sections |
| `'Global'` | Sections intended for use as globals (header, footer, announcement bar) |

If none fits, introduce a new string — it simply controls which group the section appears
in inside the picker, there is no allowlist. Omit `category` only for internal or utility
sections where grouping is irrelevant.

---

## Step 4: Register in config.ts

Edit `agntcms/config.ts` in two places.

### Add the import

Find the last line that imports from `./sections/`. Add the new import on the line immediately
after it:

```ts
import { <Name> } from './sections/<Name>'
```

Use text search to find the import block — look for lines matching `from './sections/`. Add
at the end of that block. Do not use AST parsing; simple text manipulation is sufficient.

### Add to the sections array

Find the `sections: [...]` array inside `defineConfig()`. Add `<Name>` to the end of the
array, before the closing `]`.

If the array is on one line:
```ts
// before
sections: [Hero, TextBlock]
// after
sections: [Hero, TextBlock, <Name>]
```

If the array is multi-line:
```ts
// before
sections: [
  Hero,
  TextBlock,
]
// after
sections: [
  Hero,
  TextBlock,
  <Name>,
]
```

Preserve the existing formatting style.

---

## Step 5: Verify

Run `pnpm typecheck` in the project root. If it fails:

1. Read the TypeScript error output carefully.
2. Common causes:
   - **Wrong import path**: check that `agntcms/sections/<Name>/index.ts` exports a const
     named `<Name>` and that the import in `config.ts` matches exactly.
   - **Prop type mismatch**: verify that every field in `schema.ts` has a corresponding
     `EditableSlot<K, V>` prop in the component's `Props` interface, and vice versa. Use the
     mapping table in "Prop types — slot contract" above.
   - **Missing field**: if `schema.ts` has a field that `component.tsx` does not destructure,
     `defineSection`'s generic constraint will fail.
   - **Raw field used in JSX**: if a field is used as `{fieldName}` instead of being passed to
     an `<EditableX>` component, TypeScript reports a type error because `EditableSlot<K, V>` is
     not assignable to `ReactNode`. This is by design — the type system enforces editability.
     Fix by wrapping the field in the appropriate `<EditableX>` component.
3. Fix the issue, then run `pnpm typecheck` again.
4. Do not report success until typecheck is green.

> **Note:** since v0.2, the type system structurally enforces editability. A missing
> `<EditableX>` wrapper produces a compile error at the exact JSX call site that names the
> field — no separate editability heuristic step is needed. Typecheck IS the editability gate.

---

## Step 6: Report to the developer

```
Section '<Name>' created:

  agntcms/sections/<Name>/schema.ts     — schema with <N> field(s)
  agntcms/sections/<Name>/component.tsx — <Name>Component
  agntcms/sections/<Name>/index.ts      — defineSection export

Registered in agntcms/config.ts.
typecheck: passed.
```

Note: fonts (Satoshi for display, Inter for body, JetBrains Mono for code) are loaded
globally in `app/layout.tsx` via `next/font`. No per-section font setup is needed.

---

## Error path

If name validation fails:

```
'<input>' is not a valid section name. Section names must be PascalCase and alphanumeric
(e.g. "Hero", "TextBlock", "ImageGallery").
What name would you like to use?
```

If a field type is invalid:

```
Unknown field type(s): <list>.
Valid types are: TextField, RichTextField, ImageField, ReferenceField,
  LinkField, BooleanField, NumberField, SelectField, ListField.
Please correct the field types and try again.
```

If typecheck fails after file creation:

```
typecheck failed after creating the section. Errors:

<TypeScript error output>

I will attempt to fix this. <describe what you changed>
```

---

## Key rules

1. **Always create all three files.** A partial section (e.g. missing `index.ts`) breaks
   typecheck for the whole project. Create all three atomically.
2. **Props use `EditableSlot<K, V>` types.** Every editable field in `Props` must be typed as
   `EditableSlot<K, V>` (import from `@agntcms/next/client`). `ReferenceField` stays as
   `{ slug: string }` — it is not inline-editable in v1 and has no slot. The type system will
   reject any component that renders a slot value directly in JSX without an `<EditableX>` wrapper.
3. **Use `read()` to unwrap before non-JSX use.** Call `read(slot)` (from `@agntcms/next/client`)
   whenever you need the bare value to pass to `hrefOf()`, compute conditional logic, or access
   properties (e.g. `read(cta)` then `hrefOf(ctaValue)`). Never import or call deprecated helpers
   like `resolveLinkValue`, `resolveField`, `getStringFromItem`, `getLinkFromItem`, or
   `getBooleanFromItem` — those were workarounds for the pre-slot tri-arm union and no longer exist.
4. **Never skip config.ts registration.** A section folder with no registration in
   `defineConfig()` is invisible to the framework — the section will never render.
5. **Run typecheck after creation.** It catches schema/component mismatches and enforces
   editability — a raw `{field}` in JSX is a compile error since v0.2.
6. **Ask before overwriting.** If the section already exists, always confirm with the
   developer before replacing any file.
7. **Import only what is used.** Do not import `TextField` if no field uses it; do not import
   `EditableImage` if no field renders as an image. Unused imports generate lint warnings.
   For `LinkField` fields, import `type { LinkValue } from '@agntcms/next'` and
   `type { EditableSlot } from '@agntcms/next/client'`; for navigation helpers import
   `hrefOf, isExternalLink` from `@agntcms/next`. For `ListField` fields, import
   `type { SlotItem } from '@agntcms/next/client'` and derive the item type with
   `SlotItem<typeof schema.field.itemSchema>`. `SelectField` and `ListField` are factory
   functions — call them with arguments, do not use them as plain type references in schema literals.
8. **No inline styles.** All styling via Tailwind utility classes referencing `styles/theme.css`
   tokens. The section ships styled — do not leave styling as a follow-up task.
9. **Always add `category` to `defineSection`.** `category` is a real, optional public field
   (`string | undefined`). The picker groups sections by it. Choose from the canonical list in
   Step 3 or introduce a new string. Omitting it degrades the picker UX.
10. **`LinkField` props use `EditableSlot<'link', LinkValue>`.** Use `read()` to get the bare
    `LinkValue` for `hrefOf()`. Do not declare link props as `LinkValue | PreviewFieldLike<LinkValue>`
    (that was the pre-v0.2 pattern).
11. **Conditional optional links with an inline editable wrapper** require the disjunction
    `Boolean(hrefOf(read(field))) || isSlotInPreview(field)`. Without it, an unconfigured
    link disappears in preview and the author loses the click target to open the link picker.
    Import `isSlotInPreview` from `@agntcms/next/client`. Plain `<a>` wrappers with no
    `<EditableLink>` / `<EditableImage>` / `<EditableButton>` inside do NOT need the
    disjunction — the author configures those through the settings modal instead.
12. **No semantic text tags around `<EditableRichText>`.** The markdown renderer emits
    `<h1>`–`<h6>`, `<p>`, `<pre>`, `<blockquote>`, `<ul>/<ol>/<li>`, `<strong>`, `<em>`,
    `<code>` from the field source. Section JSX wraps `<EditableRichText>` in a neutral
    container (`<div>` by default, or `<span>` for inline contexts); style
    heading/paragraph/list rules via descendant selectors like
    `prose [&_h1]:font-display [&_h1]:text-display-xl`. Use semantic `as=` only on
    `<EditableText>` (plain TextField), where the value is raw text with no markdown parsing.
13. **Never construct Tailwind class names with template-literal interpolation.** JIT cannot
    detect `` `lg:pl-${n}` `` — no CSS is generated and the layout breaks silently. Write
    the complete class string as a literal on every conditional branch.
14. **Give grid-item card wrappers `h-full flex flex-col` so heights equalize.** Use
    `mt-auto` to anchor a short bottom element (date, byline, footer link) — but not when the
    bottom element is a substantial block like a feature list. See "Tailwind class and layout
    pitfalls" for when each form applies.
15. **Always pair `overflow-x-auto` with an explicit `overflow-y` value** (typically
    `overflow-y-hidden`). The CSS spec coerces `overflow-y` from `visible` to `auto` when
    `overflow-x` is set, which can produce a phantom vertical scrollbar when inner content
    slightly overflows the cross axis.
16. **Interactive elements have hover/active feedback.** Every `<button>` and action-style
    `<a>` (tab, chip, pagination control, sort header) must include `cursor-pointer`,
    `transition-colors`, and at least one hover variant (`hover:text-…`, `hover:border-…`,
    or `hover:bg-…`). When the element has an active/inactive distinction, the inactive
    state's hover foreshadows the active state. See "Tailwind class and layout pitfalls" #4.
