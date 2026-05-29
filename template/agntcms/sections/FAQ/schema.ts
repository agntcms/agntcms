import { RichTextField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  entries: ListField({
    question: RichTextField,
    answer: RichTextField,
  }),
}
