import { RichTextField, LinkField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  body: RichTextField,
  stats: ListField({
    number: RichTextField,
    label: RichTextField,
  }),
  primaryCta: LinkField,
  secondaryCta: LinkField,
}
