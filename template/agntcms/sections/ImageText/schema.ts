import { RichTextField, TextField, LinkField, ImageField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  body: RichTextField,
  image: ImageField,
  // "left" | "right". Default "left".
  imagePosition: TextField,
  // "paper" | "paper-2". Default "paper".
  background: TextField,
  primaryCta: LinkField,
  secondaryCta: LinkField,
}
