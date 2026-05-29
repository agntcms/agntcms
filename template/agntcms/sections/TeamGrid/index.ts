import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { TeamGridComponent } from './component'

export const TeamGrid = defineSection({
  name: 'TeamGrid',
  category: 'People',
  schema,
  component: TeamGridComponent,
  previewData: {
    eyebrow: 'The team',
    headline: 'Built by people who care about craft',
    lead: 'We are a small team of engineers and designers who have spent years shipping production web products.',
    columns: '3',
    people: [
      {
        _id: '1',
        photo: { filename: 'placeholder.png', alt: 'Jordan Lee' },
        name: 'Jordan Lee',
        role: 'Co-founder & CEO',
        bio: 'Previously ran platform engineering at Meridian. Obsessed with developer experience.',
      },
      {
        _id: '2',
        photo: { filename: 'placeholder.png', alt: 'Camille Roux' },
        name: 'Camille Roux',
        role: 'Co-founder & CTO',
        bio: 'Built and scaled three content platforms from zero to millions of pages.',
      },
      {
        _id: '3',
        photo: { filename: 'placeholder.png', alt: 'Theo Anand' },
        name: 'Theo Anand',
        role: 'Design Lead',
        bio: 'Designed editor UIs at Notion and Loom. Believes great tools feel invisible.',
      },
    ],
  },
})
