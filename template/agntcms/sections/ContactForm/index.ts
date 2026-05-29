import { defineSection } from '@agntcms/next'
import { schema } from './schema'
import { ContactFormComponent } from './component'

export const ContactForm = defineSection({
  name: 'ContactForm',
  category: 'Forms',
  schema,
  component: ContactFormComponent,
  previewData: {
    headline: 'Get in touch',
    body: 'Have a question or want to see a live demo? Fill in the form and we will get back to you within one business day.',
    nameLabel: 'Your name',
    emailLabel: 'Work email',
    companyLabel: 'Company',
    messageLabel: 'How can we help?',
    submitLabel: 'Send message',
    quote: '"The support team understood our setup immediately and had us unblocked in under an hour."',
    quoteName: 'Elena Vasquez',
    quoteRole: 'CTO, Meridian Labs',
    quotePhoto: { filename: 'placeholder.png', alt: 'Elena Vasquez' },
  },
})
