import { RichTextField, TextField, ImageField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  lead: RichTextField,
  items: ListField({
    image: ImageField,
    kind: TextField,
    name: TextField,
    body: RichTextField,
    metric1Value: TextField,
    metric1Label: TextField,
    metric2Value: TextField,
    metric2Label: TextField,
  }),
}
