import { RichTextField, SelectField, ListField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  intro: RichTextField,
  items: ListField({
    // status drives the pill colour: shipped (teal), wip (amber), next (neutral).
    status: SelectField(
      [
        { value: 'shipped', label: 'Shipped' },
        { value: 'wip', label: 'In progress' },
        { value: 'next', label: 'Next' },
      ],
      { default: 'shipped' },
    ),
    label: RichTextField,
    description: RichTextField,
  }),
}
