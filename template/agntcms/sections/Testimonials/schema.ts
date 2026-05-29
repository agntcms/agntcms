import { RichTextField, TextField, ImageField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  items: ListField({
    quote: RichTextField,
    name: TextField,
    role: TextField,
    photo: ImageField,
  }),
}
