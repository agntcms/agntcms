import { RichTextField, TextField, ImageField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  columns: TextField,
  people: ListField({
    photo: ImageField,
    name: TextField,
    role: TextField,
    bio: RichTextField,
  }),
}
