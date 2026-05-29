import { RichTextField, TextField, LinkField, BooleanField, ListField } from '@agntcms/next'

export const schema = {
  plans: ListField({
    name: TextField,
    price: TextField,
    priceSub: TextField,
    featured: BooleanField,
    pitch: RichTextField,
    features: ListField({ item: RichTextField }),
    cta: LinkField,
  }),
}
