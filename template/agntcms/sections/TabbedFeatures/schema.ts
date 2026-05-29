import { RichTextField, LinkField, ImageField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  entries: ListField({
    headline: RichTextField,
    description: RichTextField,
    image: ImageField,
    cta: LinkField,
  }),
}
