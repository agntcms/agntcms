import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { TestimonialsComponent } from './component'

export const Testimonials = defineSection({
  name: 'Testimonials',
  category: 'Social proof',
  schema,
  component: TestimonialsComponent,
  previewData: {
    eyebrow: 'What people say',
    headline: 'Loved by developers and editors alike',
    items: [
      {
        _id: '1',
        quote: 'Shipping a new landing page used to take a full sprint. Now it takes a morning.',
        name: 'Priya Nair',
        role: 'Head of Growth, Luminary',
        photo: { filename: 'placeholder.png', alt: 'Priya Nair' },
      },
      {
        _id: '2',
        quote: 'The agent understands our brand guide and never goes off-script. It feels like a junior editor who actually reads the docs.',
        name: 'Marcus Webb',
        role: 'Engineering Lead, Draftbit',
        photo: { filename: 'placeholder.png', alt: 'Marcus Webb' },
      },
      {
        _id: '3',
        quote: 'I handed off the CMS to the content team on day one. Zero training needed — the UI is that obvious.',
        name: 'Sofia Ek',
        role: 'Founder, Clearmark',
        photo: { filename: 'placeholder.png', alt: 'Sofia Ek' },
      },
    ],
  },
})
