import { RichTextField, TextField, LinkField, ImageField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  // "3" | "4"
  columns: TextField,
  articles: ListField({
    image: ImageField,
    category: TextField,
    title: TextField,
    excerpt: RichTextField,
    meta: TextField,
    link: LinkField,
  }),
}
