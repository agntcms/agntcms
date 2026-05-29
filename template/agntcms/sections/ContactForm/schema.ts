import { RichTextField, TextField, ImageField } from '@agntcms/next'

export const schema = {
  headline: RichTextField,
  body: RichTextField,
  nameLabel: TextField,
  emailLabel: TextField,
  companyLabel: TextField,
  messageLabel: TextField,
  submitLabel: TextField,
  quote: RichTextField,
  quoteName: TextField,
  quoteRole: TextField,
  quotePhoto: ImageField,
}
