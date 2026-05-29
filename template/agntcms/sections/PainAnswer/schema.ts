import { RichTextField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  intro: RichTextField,
  // Header labels for the two columns.
  painLabel: RichTextField,
  oursLabel: RichTextField,
  // Each row pairs a "pain" statement with an "ours" answer.
  rows: ListField({
    pain: RichTextField,
    ours: RichTextField,
  }),
}
