import { ImageField, ListField, RichTextField } from '@agntcms/next'

export const schema = {
  // ALL CAPS section label — category for the post (e.g. "Product", "Engineering").
  category: { kind: 'richText' as const, default: 'Product' },

  // Display title rendered as Satoshi 500 H1.
  title: {
    kind: 'richText' as const,
    default: '# A new post.',
  },

  // 1–2 sentence summary shown under the headline.
  summary: {
    kind: 'richText' as const,
    default: 'A short standfirst that frames the post in plain language.',
  },

  // Author name rendered as plain text byline. Single author by default.
  author: { kind: 'richText' as const, default: 'agntcms Team' },

  // Publication date — free-form string, e.g. "May 1, 2026".
  publishedAt: { kind: 'richText' as const, default: 'May 1, 2026' },

  // Approximate reading time, e.g. "5 min read".
  readingTime: { kind: 'richText' as const, default: '5 min read' },

  // Hero cover image. Required; alt collected via the image picker.
  cover: ImageField,

  // Tags rendered as a row of small uppercase chips.
  tags: ListField({
    label: RichTextField,
  }),
}
