import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { LogoStripComponent } from './component'

export const LogoStrip = defineSection({
  name: 'LogoStrip',
  category: 'Logos',
  schema,
  component: LogoStripComponent,
  previewData: {
    lead: 'Trusted by fast-moving teams worldwide',
    logos: [
      { _id: '1', name: 'Acme Corp' },
      { _id: '2', name: 'Globex' },
      { _id: '3', name: 'Initech' },
      { _id: '4', name: 'Umbrella Co' },
      { _id: '5', name: 'Soylent' },
      { _id: '6', name: 'Hooli' },
    ],
  },
})
