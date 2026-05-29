import { RichTextField, TextField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  categories: ListField({ label: TextField }),
}
