import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { SiteFooterComponent } from './component'

export const SiteFooter = defineSection({
  name: 'SiteFooter',
  category: 'Layout',
  schema,
  component: SiteFooterComponent,
})
