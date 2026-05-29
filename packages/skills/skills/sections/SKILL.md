---
name: agntcms-sections
user-invocable: true
description: Enforces the two-step section creation workflow — create the folder under agntcms/sections/, then add the import and registration to agntcms/config.ts. Partial state is invalid.
---

# agntcms Section Creation

Creating a section is exactly two operations. Both are required. Partial state — a folder without
a config entry, or a config entry without a folder — is invalid and will either be invisible to
the framework or cause a compile-time import error.

---

## Step 1: Create the section folder

Create `agntcms/sections/<SectionName>/` and populate it with the following files.

### `index.ts` (required)

The entry point for the section. Calls `defineSection` and exports the `SectionDefinition`.

```typescript
import { defineSection, TextField, ImageField } from '@agntcms/next'
import { Hero } from './component'

export const HeroSection = defineSection({
  name: 'Hero',
  category: 'Hero',
  schema: { title: TextField, image: ImageField },
  component: Hero,
})
```

The `name` value (`'Hero'`) is the string that content JSON uses in the `type` field. It must
be unique across all registered sections. Choose it carefully — renaming it later requires
a migration of all content files that reference the old name.

**`category`** is optional but should always be set. It groups sections in the picker modal.
Canonical values used by the template: `'Hero'`, `'Content'`, `'CTA'`, `'Features'`,
`'Social Proof'`, `'Forms'`, `'Layout'`, `'Global'`. Any string is valid — these are just the
established conventions. See `agntcms-section-new` for the full list and guidance.

### `component.tsx` (required)

The React component that renders the section. Props must match the schema exactly — TypeScript
will catch mismatches at compile time. Use `EditableText`, `EditableImage`, and other
`<EditableX>` components from `@agntcms/next/client` so fields are inline-editable through
the live UI. Since v0.2, `Props` use `EditableSlot<K, V>` instead of raw value types — this
means rendering a field as `{title}` directly in JSX is a compile error. The type system
enforces that every editable field is passed to an `<EditableX>` wrapper.

For `LinkField` fields, `EditableLink` renders only the label text; wrap it in an `<a>`
element in the section component (the section controls `href` and `target`/`rel`, the editor
controls the label). Use `read(slot)` from `@agntcms/next/client` to unwrap the slot to a
bare `LinkValue` for use with `hrefOf()`. See `agntcms-section-new` for the full pattern.

```tsx
'use client'

import { EditableText, EditableImage } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'

interface HeroProps {
  readonly title: EditableSlot<'text', string>
  readonly image: EditableSlot<'image', ImageValue>
}

export function Hero({ title, image }: HeroProps) {
  return (
    <section className="bg-bg-primary py-16 px-6 flex flex-col items-center gap-6 text-center">
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

For `RichTextField` fields, use a neutral wrapper and push heading/paragraph styles to
descendant selectors. The markdown source carries the semantic level:

```tsx
// RichTextField — neutral wrapper, semantics come from the markdown source
<EditableRichText
  field={body}
  className="prose [&_h2]:font-display [&_h2]:text-display-md [&_p]:text-text-secondary"
/>
// Field value in content JSON: "## Heading\n\nParagraph text."
// Renders: <div class="prose ..."><h2>Heading</h2><p>Paragraph text.</p></div>
```

### Common pitfalls in component.tsx

Four pattern-level mistakes that compile without error but break at runtime or produce
invisible styles or missing affordances. See "Tailwind class and layout pitfalls" in `agntcms-section-new` for
bad/good code snippets and the full explanation of each.

- Never interpolate variables inside a Tailwind class name (e.g. `` `lg:pl-${odd ? '0' : '8'}` ``). JIT scans source text statically; a runtime-composed class name is never included in the CSS bundle.
- Give grid-item card wrappers `h-full flex flex-col` and anchor bottom content with `mt-auto`, or cards in a stretched row won't equalize height and meta lines float mid-row.
- Always pair `overflow-x-auto` with an explicit `overflow-y` value (typically `overflow-y-hidden`). The CSS spec coerces `overflow-y` from `visible` to `auto` when `overflow-x` is set, which can produce a phantom vertical scrollbar.
- Every clickable element (`<button>`, action-style `<a>`, tabs, chips, pagination) must include `cursor-pointer`, `transition-colors`, and a visible hover state. When the element has an active/inactive distinction, the inactive hover foreshadows the active state (`hover:text-…`, `hover:border-…`). Otherwise the element looks decorative even though it's clickable.

---

### `schema.ts` (standard; inline is an option only for very simple schemas)

The canonical layout keeps the schema in its own file so it can be imported independently
by both `index.ts` and any tests:

```typescript
import { TextField, ImageField } from '@agntcms/next'

export const schema = {
  title: TextField,
  image: ImageField,
} as const
```

You may inline the schema directly in `index.ts` only when it has one or two fields and is
unlikely to grow. All template sections with three or more fields use a separate `schema.ts`.

### `preview.png` (recommended)

A screenshot or visual thumbnail of the section. The admin UI and the agent use this image
when presenting section choices to the editor. It is not required for the build to succeed, but
its absence degrades the section-selection experience. Add it when the component exists.

---

## Step 2: Register in `agntcms/config.ts`

Add exactly two lines: one import and one array entry.

```typescript
import { defineConfig } from '@agntcms/next/config'
import { HeroSection } from './sections/Hero'      // ← new import
import { TextBlock } from './sections/TextBlock'

export default defineConfig({
  sections: [HeroSection, TextBlock],               // ← HeroSection added to array
  // adapter config here
})
```

Both the import path and the array entry must be present. One without the other is a bug.

---

## Detecting partial state

Before declaring a section creation done, verify the two-step invariant:

1. Run `ls agntcms/sections/` — every directory here must have a corresponding import and
   array entry in `agntcms/config.ts`.
2. Read `agntcms/config.ts` — every import from `./sections/*` must have a matching directory
   under `agntcms/sections/`.
3. If a folder exists without a config entry: the section is invisible to the runtime. Add the
   two lines.
4. If a config entry exists without a folder: the TypeScript compiler will error on import.
   Create the missing folder with the required files.

---

## Template sections

The reference template ships with the following sections. They live under `agntcms/sections/`
and are registered in `agntcms/config.ts`. Use them as-is, extend them, or replace them.

| Section | Category | Purpose |
|---------|----------|---------|
| `Hero` | Hero | Full-width hero with headline, subtitle, CTA, and footnote. |
| `Features` | Content | Grid of feature cards with icon, title, and body. |
| `Pricing` | Content | Side-by-side pricing tiers with feature lists and CTAs. |
| `Testimonials` | Content | Horizontal quote cards with author name, role, and avatar. |
| `FAQ` | Content | Accordion-style question/answer pairs. |
| `CTA` | Content | Centered call-to-action with headline, body, and two link buttons. |
| `TextBlock` | Content | Simple markdown body block for long-form prose. |
| `ContactSection` | Content | Contact section with static form fields (name, email, company, message). No backend submission wiring in v1. |
| `PostList` | Content | Fetches published pages by tag and renders a paginated card grid. |
| `Video` | Content | Embeds a hosted video from YouTube, Vimeo, Wistia, or Loom. Accepts a raw share URL, detects the provider, and renders the correct iframe in the chosen aspect ratio (16:9 / 4:3 / 1:1 / 9:16). The URL and aspect ratio are structural fields (edited via the data form); label, headline, and caption are EditableText fields inline-editable in preview mode. v0.2 will add automatic aspect-ratio detection via oEmbed. |
| `SiteHeader` | Global | Site-wide header — intended for use as a global via `<GlobalSlot>`. |
| `SiteFooter` | Global | Site-wide footer — intended for use as a global via `<GlobalSlot>`. |
| `AnnouncementBar` | Global | Dismissible announcement strip — intended for use as a global. |

---

## LinkField — slot and `read()` pattern

Since v0.2, `LinkField` props use `EditableSlot<'link', LinkValue>` instead of the old
`LinkValue | PreviewFieldLike<LinkValue>` union. Use `read(slot)` from `@agntcms/next/client`
to unwrap the slot to the bare `LinkValue` for use with `hrefOf()` and `isExternalLink()`.

The rule: **declare the prop as `EditableSlot<'link', LinkValue>`, call `read()` once at the
top of the component body, then use the result for navigation logic**.

### Canonical boilerplate

```tsx
import { EditableLink, read } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

interface Props {
  readonly cta: EditableSlot<'link', LinkValue>
}

export function MySection({ cta }: Props) {
  // read() unwraps the slot to the bare LinkValue.
  const ctaValue = read(cta)
  return (
    <a
      href={hrefOf(ctaValue)}
      target={isExternalLink(ctaValue) ? '_blank' : undefined}
      rel={isExternalLink(ctaValue) ? 'noreferrer' : undefined}
    >
      <EditableLink field={cta} className="..." />
    </a>
  )
}
```

### LinkField items inside a ListField

When a `ListField` item schema contains a `LinkField`, item fields are themselves
`EditableSlot` values. Call `read(item.linkField)` to get the bare `LinkValue`:

```tsx
renderItem={(item) => {
  const link = read(item.ctaField)
  return (
    <a
      href={hrefOf(link) || '#'}
      target={isExternalLink(link) ? '_blank' : undefined}
      rel={isExternalLink(link) ? 'noreferrer' : undefined}
    >
      <EditableLink field={item.ctaField} className="..." />
    </a>
  )
}}
```

No manual casting or narrowing helpers are needed — the slot type carries the correct `V`.

### Cross-reference

`agntcms-section-new` shows the full slot-based pattern in its "LinkField — wrapping
pattern" section and key rules 10–11. Read it before scaffolding any section that has a
`LinkField`.

---

## Overriding heading sizes inside EditableRichText

### The cascade trap (Bug 2)

`styles/typography.css` defines prose heading rules using `:where()` pseudo-class selectors:

```css
.prose :not(:where([class~="not-prose"], …)) {
  &:where(h1) { font-size: var(--text-display-sm); … }
  &:where(h2) { font-size: var(--text-display-xs); … }
}
```

This file is imported in `styles/globals.css` **outside any `@layer`**. Tailwind's utility
classes such as `[&_h1]:text-[clamp(40px,6vw,72px)]` land inside `@layer utilities`. Per the
CSS cascade specification, unlayered author CSS beats every `@layer` regardless of selector
specificity. The prose rule therefore wins over the utility override even though
`.classname h1` (0,1,1) is nominally more specific than `.prose :where(h1)` (0,1,0).

The same trap exists for global heading rules in `styles/theme.css` — those are also outside
any `@layer`.

**Consequence:** writing `className="prose [&_h1]:text-[clamp(40px,6vw,72px)]"` on a prose
wrapper has no visual effect. The override compiles without error but is silently discarded.

### Fix: use the `!` prefix on size utilities

Tailwind v4's `!` prefix emits `!important` on the generated declaration. `!important`
beats unlayered author CSS:

```tsx
<EditableRichText
  field={headline}
  className="
    [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-text-primary [&_h1]:m-0
    [&_h1]:!text-[clamp(40px,6vw,72px)] [&_h1]:!leading-[1.02] [&_h1]:!tracking-[-0.04em]
  "
/>
```

Apply `!` only to `font-size`, `line-height`, and `letter-spacing` — the three properties
that the prose and global base styles compete on. Font family, color, and margin overrides
do not collide with unlayered rules and need no `!`.

Without the `!` prefix those three properties silently revert to the design-token defaults
(`--text-display-sm` for h1, `--text-display-xs` for h2) regardless of what you write in
`className`.

### When to use token sizes vs. custom clamp values

The design-token sizes (`text-display-lg`, `text-display-sm`, etc.) are the prose defaults.
If a section needs sizes **within** the token scale, the tokens win the cascade without `!`
only if they are applied outside `.prose` context (e.g. on a plain `EditableText as="h1"`).
Inside `.prose` you still need `!` when overriding. Prefer custom `clamp()` values for
hero-level display copy where the size should respond fluidly to the viewport; use token
sizes for body-scale headings.

### ch units on the prose wrapper vs. the heading element (Bug 3)

`ch` is the width of the `0` glyph in the **element's own computed font**. The prose wrapper
carries `font-body` (Inter); the `<h1>` inside it carries `font-display` (Satoshi). Satoshi's
`0` glyph is approximately 30 % wider than Inter's, so `max-w-[18ch]` on the wrapper produces
a visually narrower constraint than intended.

**Rule: always attach `max-w-[Nch]` to the heading element selector, not the prose wrapper.**

```tsx
// Wrong — ch measured in body font (Inter), yields narrower measure than designed
<EditableRichText
  field={headline}
  className="max-w-[18ch] [&_h1]:font-display …"
/>

// Correct — ch measured in display font (Satoshi), matches design intent
<EditableRichText
  field={headline}
  className="[&_h1]:max-w-[18ch] [&_h1]:font-display …"
/>
```

This rule applies for any constraint where the font on the element differs from the font on
the wrapper. For `<h2>` sections using `font-display`, the same correction applies:
`[&_h2]:max-w-[22ch]` instead of `max-w-[22ch]` on the wrapper.

### Reference implementations

The following template sections demonstrate all three fixes:

- `template/agntcms/sections/Hero/component.tsx` — h1 with `[&_h1]:!text-[clamp(...)]`,
  `[&_h1]:!leading-[1.02]`, `[&_h1]:!tracking-[-0.04em]`, `[&_h1]:max-w-[18ch]`
- `template/agntcms/sections/OpenSource/component.tsx` — h2 with the same `!`-prefix
  pattern and `[&_h2]:max-w-[22ch]`
- `template/agntcms/sections/GettingStarted/component.tsx` — same h2 pattern
- `template/agntcms/sections/HowItWorks/component.tsx` — h2 and h3 overrides in list item
  cards using `[&_h3]:!text-[20px]`

---

## Built-in field types

Field types are defined in `@agntcms/next` and are not user-extensible in v1. Use them
directly in schema definitions:

> **Visible copy policy**: model user-visible section text as `RichTextField` and render it with
> `<EditableRichText>`. Keep `TextField` for non-visible data strings only (URLs, slugs, IDs,
> SEO-only values, similar machine-facing content).
>
> **EditableText vs EditableRichText**: `RichTextField` uses `<EditableRichText>` (renders
> markdown — bold, italic, links, headings, line breaks). `TextField` uses `<EditableText>` (plain
> text, no markdown) and should not be used for visible section copy. Don't mix them — markdown
> will not render in `<EditableText>` after v0.2.
>
> **Nested-heading pitfall**: `EditableRichText` passes its content through a markdown renderer
> that emits real `<h1>`–`<h6>` tags from `# …######` markers (and `<p>` / `<pre>` /
> `<blockquote>` / `<ul>/<ol>/<li>` / `<strong>` / `<em>` / `<code>` from their respective
> markers). Setting `as="h1"` on an `EditableRichText` whose stored content begins with
> `# My Heading` produces `<h1><h1>…</h1></h1>` — invalid HTML that breaks screen readers
> and SEO. **Always use a generic container (`as="div"` default, or `as="span"` for inline
> contexts) on `EditableRichText`**, and target the markdown-emitted elements with descendant
> selectors: `[&_h1]:font-display [&_h1]:text-display-xl [&_p]:text-text-secondary`.
> Reserve semantic text tags (`as="h1"`, `as="p"`, `as="pre"`, `as="blockquote"`, etc.) for
> `<EditableText>` only — plain text emits no inner tags.

| Export | `Props` type (since v0.2) | Use for |
|--------|--------------------------|---------|
| `TextField` | `EditableSlot<'text', string>` | Short text, headings, labels |
| `RichTextField` | `EditableSlot<'richText', string>` | Long-form content, body copy (markdown) |
| `ImageField` | `EditableSlot<'image', ImageValue>` | Asset filename + alt text from `public/assets/` |
| `ReferenceField` | `ReferenceValue` (`{ slug: string }`) | Reference to another page — stays raw, no slot |
| `LinkField` | `EditableSlot<'link', LinkValue>` | Navigation links, CTA buttons — use `read()` for `hrefOf()` |
| `BooleanField` | `EditableSlot<'boolean', boolean>` | Toggles, flags (e.g. `dismissible`, `showBorder`) |
| `NumberField` | `EditableSlot<'number', number>` | Counts, sizes, durations; optional `min`/`max`/`step` hints |
| `SelectField([...])` | `EditableSlot<'select', string>` | Fixed-choice fields; call as `SelectField([{ value, label }, ...])` |
| `ListField({...})` | `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>` | Ordered list of structured sub-items; item fields are also slots |

`SelectField` and `ListField` are factory functions — call them with arguments. All others are
singleton values that can be used directly in a schema object literal.

Do not define your own field type objects. Stick to the built-in set.

### LinkValue — discriminated union

`LinkValue` is a discriminated union with four branches:

```ts
type LinkValue =
  | { type: 'internal'; slug: string; label: string }
  | { type: 'external'; url: string;  label: string }
  | { type: 'email';    email: string; label: string }
  | { type: 'phone';    phone: string; label: string }
```

- `internal` — links to another page in this site; `slug` is the page slug.
- `external` — links to an external URL; `url` is the full URL.
- `email` — opens a mail client; `email` is the address (may include display formatting).
- `phone` — opens a phone dialer; `phone` is the number (may include spaces, parens, hyphens for legibility).

Use the helpers exported from `@agntcms/next` to produce the correct href and target
without branching on `type` manually:

```tsx
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

// Canonical anchor pattern for a LinkValue:
<a
  href={hrefOf(link)}
  target={isExternalLink(link) ? '_blank' : undefined}
  rel={isExternalLink(link) ? 'noreferrer' : undefined}
>
  {link.label}
</a>
```

`hrefOf` returns `'/<slug>'` for internal links (or `'/'` when slug is `''` or `'home'`),
`link.url` for external links, `'mailto:<email>'` for email links, and `'tel:<phone>'`
(with non-digit characters stripped) for phone links. Never access `link.href` or
`link.external` — those properties do not exist on the type.

---

## Key rules

1. **Both steps are required.** A folder without a config entry is invisible. A config entry
   without a folder is a compile error.

2. **The `name` in `defineSection` is the content `type` field.** Content JSON refers to
   sections by this string. Rename it only with a deliberate content migration.

3. **TypeScript enforces schema-component alignment.** If the component props do not match the
   schema, the build fails. This is intentional — fix the mismatch at the source, not by casting.

4. **Never scan or auto-discover.** Do not write code that iterates `agntcms/sections/` at
   runtime to find sections. Registration is always explicit through `config.ts`.

5. **Section names are globally unique.** Two sections cannot share the same `name` value
   within one project.

6. **Use Tailwind classes, not inline styles.** Read `styles/theme.css` for available tokens.
   Use semantic classes like `bg-bg-primary`, `text-text-primary`, `font-display`. Never
   hardcode hex values or use `style={}` objects.

7. **No semantic text tags around `<EditableRichText>`.** The markdown renderer emits
   `<h1>`–`<h6>`, `<p>`, `<pre>`, `<blockquote>`, `<ul>/<ol>/<li>`, `<strong>`, `<em>`,
   `<code>` from the field source. Section JSX wraps `<EditableRichText>` in a neutral
   container (`<div>` by default, or `<span>` for inline contexts); style
   heading/paragraph/list rules via descendant selectors like
   `prose [&_h1]:font-display [&_h1]:text-display-xl`. Use semantic `as=` only on
   `<EditableText>` (plain TextField), where the value is raw text with no markdown parsing.
