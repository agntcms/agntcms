import { RichTextField, TextField, LinkField, ImageField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  // Headline. Use *italic* for muted segments rendered in ink-3.
  headline: RichTextField,
  lead: RichTextField,
  // Optional hero image — when filename is empty the hero renders text only.
  image: ImageField,
  primaryCta: LinkField,
  secondaryCta: LinkField,
  // "split" | "stacked-center" | "stacked-left". Default "split".
  layout: TextField,
  // "paper" | "paper-2". Default "paper".
  background: TextField,
}
