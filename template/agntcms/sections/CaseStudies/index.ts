import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { CaseStudiesComponent } from './component'

export const CaseStudies = defineSection({
  name: 'CaseStudies',
  category: 'Social proof',
  schema,
  component: CaseStudiesComponent,
  previewData: {
    eyebrow: 'Case studies',
    headline: 'Real teams. Real results.',
    lead: 'See how fast-moving companies use agntcms to launch and iterate without slowing down.',
    items: [
      {
        _id: '1',
        image: { filename: 'placeholder.png', alt: 'Luminary case study' },
        kind: 'SaaS',
        name: 'Luminary',
        body: 'Luminary rebuilt their marketing site in two weeks and now ships copy updates same-day.',
        metric1Value: '2×',
        metric1Label: 'faster publishing',
        metric2Value: '40%',
        metric2Label: 'fewer engineering hours',
      },
      {
        _id: '2',
        image: { filename: 'placeholder.png', alt: 'Clearmark case study' },
        kind: 'Agency',
        name: 'Clearmark',
        body: 'Clearmark onboards new clients onto branded sites in under a day using the section library.',
        metric1Value: '8×',
        metric1Label: 'faster onboarding',
        metric2Value: '3 hrs',
        metric2Label: 'average setup time',
      },
      {
        _id: '3',
        image: { filename: 'placeholder.png', alt: 'Draftbit case study' },
        kind: 'Dev tools',
        name: 'Draftbit',
        body: 'Draftbit\'s content team edits and publishes without filing tickets to engineering.',
        metric1Value: '100%',
        metric1Label: 'editor autonomy',
        metric2Value: '0',
        metric2Label: 'eng tickets for content',
      },
    ],
  },
})
