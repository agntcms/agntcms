import { TextField, RichTextField, LinkField, BooleanField, ListField } from '@agntcms/next'

export const schema = {
  brandName: TextField,
  showCaret: BooleanField,
  tagline: RichTextField,
  columns: ListField({
    heading: TextField,
    links: ListField({ label: TextField, link: LinkField }),
  }),
  copyright: TextField,
  versionLine: TextField,
}
