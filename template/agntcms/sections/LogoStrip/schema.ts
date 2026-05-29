import { RichTextField, TextField, ListField } from '@agntcms/next'

export const schema = {
  lead: RichTextField,
  logos: ListField({ name: TextField }),
}
