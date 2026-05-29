import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ImageTextComponent } from './component'

export const ImageText = defineSection({
  name: 'ImageText',
  category: 'Content',
  schema,
  component: ImageTextComponent,
  previewData: {
    eyebrow: 'How it works',
    headline: 'Edit content without leaving the page',
    body: 'Click any text or image on the live preview to open the inline editor. Changes are reflected immediately in the preview — no save-and-refresh cycle.',
    image: { filename: 'placeholder.png', alt: 'Inline editing in action' },
    imagePosition: 'right',
    background: 'paper',
    primaryCta: { type: 'internal', slug: '', label: 'See the demo' },
    secondaryCta: { type: 'internal', slug: '', label: 'Read the docs' },
  },
})
