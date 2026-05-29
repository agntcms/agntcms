import { RichTextField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  // Long-form prose rendered as a stack of paragraphs (markdown).
  body: RichTextField,
  // Eyebrow inside the highlight message block.
  messageEyebrow: RichTextField,
  // Highlight statement inside the teal-bordered message block.
  message: RichTextField,
}
