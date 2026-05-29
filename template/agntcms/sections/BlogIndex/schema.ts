import { ImageField, ListField, RichTextField, TextField } from '@agntcms/next'

export const schema = {
  // ALL CAPS section label.
  eyebrow: { kind: 'richText' as const, default: 'Writing' },

  // Page headline.
  headline: {
    kind: 'richText' as const,
    default: '# Blog.',
  },

  // Standfirst under the headline.
  intro: {
    kind: 'richText' as const,
    default:
      'Notes on the product, the philosophy, and the open-source progress. ' +
      'Short pieces, written in the open.',
  },

  // List of posts. The first item is rendered as the large "featured" card
  // at the top of the index. Remaining items render in a 2-up grid.
  posts: ListField({
    title: RichTextField,
    summary: RichTextField,
    href: TextField,
    cover: ImageField,
    category: RichTextField,
    publishedAt: RichTextField,
    author: RichTextField,
    readingTime: RichTextField,
  }),
}
