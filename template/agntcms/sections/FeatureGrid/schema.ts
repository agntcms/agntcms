import { RichTextField, TextField, LinkField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  // "3" | "4"
  columns: TextField,
  // "icon" | "stat" | "step" — controls visual emphasis of each card
  variant: TextField,
  cards: ListField({
    // Inline SVG markup as a raw string. Not inline-editable; intended to be
    // populated from a curated icon set. Rendered via dangerouslySetInnerHTML
    // so currentColor and stroke utilities work.
    iconSvg: TextField,
    stat: TextField,
    label: TextField,
    body: RichTextField,
  }),
  footerCta: LinkField,
}
