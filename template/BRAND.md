# agntcms — Brand Guide

This is the brand and design guide for the demo content shipped with
this template. When `/agntcms-init` runs against a real Claude Design
bundle, this file is rewritten to point at that bundle. Until then,
these rules describe the in-tree demo.

## Source of truth

- Tokens live verbatim in `styles/theme.css` (in the `:root` block at
  the top of the file). They are consumed via Tailwind utility classes
  through the `@theme` block — utilities such as `bg-paper`,
  `text-ink`, `text-ink-2`, `text-ink-3`, `border-hairline`,
  `font-display`, `font-mono` all resolve through these tokens.
  Running `grep -rE '#[0-9a-fA-F]{3,6}' styles/ agntcms/sections/`
  should match only token definition lines or SVG markup.
- Page copy and section ordering live in `content/pages/<slug>.json`
  and `content/globals/*.json`. The JSON is the content source —
  never inline a layout into a page component.
- Every visible block becomes a registered agntcms section under
  `agntcms/sections/<Name>/` with two-line registration in
  `agntcms/config.ts`. If a needed block has no matching section
  type, stop and run `/agntcms-section-new`.

## Accent policy

Monochrome by default — paper + ink. The brand still owns Electric
Teal (`var(--teal)`, `#2DD4BF`), but the design system does not apply
it anywhere automatically. Tokens for `--teal`, `--teal-ink`,
`--teal-tint`, `--teal-deep`, and `--caret` are defined; they are
inert unless a component references them by name.

The one exception is the wordmark caret — the 7×14px blinking block
cursor after `agntcms`. That is the only place teal ships on by
default. Everything else (eyebrows, link decoration, focus rings,
hover states, pill dots) is ink — `--ink`, `--ink-2`, `--ink-3`. Never
teal.

## Tone

Developer-to-developer, senior, unsentimental. Short sentences.
Concrete numbers over adjectives. No buzzwords (banned:
*seamless, robust, leverage, synergy, blazingly, cutting-edge,
revolutionary, unleash, empower, journey, ecosystem*; `AI-powered`
as a bare phrase is banned — say what the AI actually does). No
emoji in marketing copy. Sentence case for everything except product
names.

Frozen zone is off-limits throughout (see `CLAUDE.md`).
