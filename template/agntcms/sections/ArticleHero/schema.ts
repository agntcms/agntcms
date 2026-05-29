import { TextField, LinkField, ImageField } from '@agntcms/next'

export const schema = {
  // "Back to blog"-style link at the top of the article.
  backLink: LinkField,
  category: TextField,
  title: TextField,
  authorName: TextField,
  authorPhoto: ImageField,
  meta: TextField,
  coverImage: ImageField,
}
