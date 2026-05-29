import { TextField, LinkField, BooleanField, ListField } from '@agntcms/next'

export const schema = {
  // Wordmark text (lowercase mono).
  brandName: TextField,
  // When true, render the teal blinking caret after the wordmark.
  showCaret: BooleanField,
  // Primary navigation.
  navItems: ListField({ label: TextField, link: LinkField }),
  // "Sign in"-style secondary header CTA.
  signInCta: LinkField,
  // "Start building"-style primary header CTA.
  primaryCta: LinkField,
}
