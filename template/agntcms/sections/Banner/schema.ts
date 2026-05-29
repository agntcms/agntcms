import { RichTextField, LinkField, ImageField } from '@agntcms/next'

export const schema = {
  headline: RichTextField,
  lead: RichTextField,
  primaryCta: LinkField,
  secondaryCta: LinkField,
  image: ImageField,
}
