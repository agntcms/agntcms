import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { SiteMetaComponent } from './component'

export const SiteMeta = defineSection({
  name: 'SiteMeta',
  // 'Global' category groups this section with SiteHeader/SiteFooter in the
  // picker so authors understand it is a layout/infrastructure section rather
  // than a page content block.
  category: 'Global',
  // system: true marks this as a framework-managed global — the admin UI hides
  // it from the section picker and the user-globals list, and prevents deletion.
  system: true,
  schema,
  component: SiteMetaComponent,
})
