import { RichTextField, LinkField } from '@agntcms/next'

export const schema = {
  eyebrow: RichTextField,
  headline: RichTextField,
  intro: RichTextField,
  command: RichTextField,
  meta: RichTextField,
  primaryCta: LinkField,
  secondaryCta: LinkField,
}
