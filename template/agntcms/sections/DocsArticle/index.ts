import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { DocsArticleComponent } from './component'

export const DocsArticle = defineSection({
  name: 'DocsArticle',
  category: 'Docs',
  schema,
  component: DocsArticleComponent,
  previewData: {
    sidebar: [
      {
        _id: '1',
        title: 'Getting started',
        items: [
          { _id: 'i1', label: 'Quick start', href: '/docs/quick-start', active: true },
          { _id: 'i2', label: 'Installation', href: '/docs/installation', active: false },
          { _id: 'i3', label: 'Project structure', href: '/docs/structure', active: false },
        ],
      },
      {
        _id: '2',
        title: 'Sections',
        items: [
          { _id: 'i4', label: 'Define a section', href: '/docs/define-section', active: false },
          { _id: 'i5', label: 'Field types', href: '/docs/field-types', active: false },
          { _id: 'i6', label: 'Section registry', href: '/docs/registry', active: false },
        ],
      },
    ],
    eyebrow: 'Getting started',
    title: '# Quick start',
    lead: 'Spin up an agntcms project and ship your first page in under five minutes.',
    body: '## Install\n\nRun the create command in an empty directory:\n\n```bash\nnpx create-agntcms@latest\n```\n\n## Start editing\n\nOpen the admin panel at `localhost:3000/agntcms` and click any section to edit it inline.',
    prev: { type: 'internal', slug: '', label: '' },
    next: { type: 'internal', slug: 'docs/installation', label: 'Installation' },
  },
})
