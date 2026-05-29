import { RichTextField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  steps: ListField({
    number: RichTextField,
    title: RichTextField,
    description: RichTextField,
  }),
}
