import { LinkField, ListField } from '@agntcms/next'

export const schema = {
  // Sidebar nav: groups of links shared across all docs pages.
  sidebar: ListField({
    title: { kind: 'richText' as const, default: 'Getting started' },
    items: ListField({
      label: { kind: 'richText' as const, default: 'Quick start' },
      href: { kind: 'text' as const, default: '/docs/quick-start' },
      active: { kind: 'boolean' as const, default: false },
    }),
  }),

  // Page header.
  eyebrow: { kind: 'richText' as const, default: 'Getting started' },
  title: { kind: 'richText' as const, default: '# Quick start' },
  lead: {
    kind: 'richText' as const,
    default: 'Spin up an agntcms project and ship your first page in under five minutes.',
  },

  // Main article — markdown. Headings (##, ###) become anchored sections;
  // the right-hand TOC is built from them at runtime.
  body: {
    kind: 'richText' as const,
    default:
      '## Install\n\nRun the create command in an empty directory:\n\n```bash\nnpx create-agntcms@latest\n```\n',
  },

  // Bottom prev/next links.
  prev: LinkField,
  next: LinkField,
}
