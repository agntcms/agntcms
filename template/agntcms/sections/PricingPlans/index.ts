import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { PricingPlansComponent } from './component'

export const PricingPlans = defineSection({
  name: 'PricingPlans',
  category: 'Pricing',
  schema,
  component: PricingPlansComponent,
  previewData: {
    plans: [
      {
        _id: '1',
        name: 'Starter',
        price: 'Free',
        priceSub: 'forever',
        featured: false,
        pitch: 'Everything you need to try agntcms on a personal project.',
        features: [
          { _id: 'f1', item: 'Up to 3 pages' },
          { _id: 'f2', item: 'FS storage adapter' },
          { _id: 'f3', item: 'Community support' },
        ],
        cta: { type: 'internal', slug: '', label: 'Get started free' },
      },
      {
        _id: '2',
        name: 'Pro',
        price: '$49',
        priceSub: 'per month',
        featured: true,
        pitch: 'Full agent access and unlimited pages for growing teams.',
        features: [
          { _id: 'f1', item: 'Unlimited pages' },
          { _id: 'f2', item: 'Agent editing (Claude Code)' },
          { _id: 'f3', item: 'Custom adapters' },
          { _id: 'f4', item: 'Priority support' },
        ],
        cta: { type: 'internal', slug: '', label: 'Start free trial' },
      },
      {
        _id: '3',
        name: 'Enterprise',
        price: 'Custom',
        priceSub: 'contact us',
        featured: false,
        pitch: 'Dedicated infrastructure, SLAs, and hands-on onboarding for large teams.',
        features: [
          { _id: 'f1', item: 'Custom deployment' },
          { _id: 'f2', item: 'SSO / SAML' },
          { _id: 'f3', item: 'Dedicated support engineer' },
          { _id: 'f4', item: 'SLA guarantee' },
        ],
        cta: { type: 'internal', slug: '', label: 'Talk to sales' },
      },
    ],
  },
})
