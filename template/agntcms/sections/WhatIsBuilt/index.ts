import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { WhatIsBuiltComponent } from './component'

export const WhatIsBuilt = defineSection({
  name: 'WhatIsBuilt',
  category: 'Content',
  schema,
  component: WhatIsBuiltComponent,
  previewData: {
    eyebrow: 'Roadmap',
    headline: 'What is shipped, what is next',
    intro: 'agntcms ships incrementally. Here is where things stand today.',
    items: [
      {
        _id: '1',
        status: 'shipped',
        label: 'Inline text editing',
        description: 'Click any text field on the page to edit it directly without opening a modal.',
      },
      {
        _id: '2',
        status: 'shipped',
        label: 'Section picker modal',
        description: 'Browse and insert any registered section type from a visual card gallery.',
      },
      {
        _id: '3',
        status: 'shipped',
        label: 'Git-native content store',
        description: 'All content is plain JSON committed to your repository alongside your code.',
      },
      {
        _id: '4',
        status: 'wip',
        label: 'Multi-user drafts',
        description: 'Branch-based drafting so multiple editors can work on the same page simultaneously.',
      },
      {
        _id: '5',
        status: 'next',
        label: 'Content collections',
        description: 'First-class support for structured lists like blog posts, changelog entries, and team members.',
      },
    ],
  },
})
