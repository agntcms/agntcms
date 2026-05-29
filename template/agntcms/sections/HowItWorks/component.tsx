'use client'

import { EditableRichText, EditableList } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Step = SlotItem<typeof schema.steps.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly steps: EditableSlot<'list', ReadonlyArray<Step>>
}

export function HowItWorksComponent({ eyebrow, headline, steps }: Props) {
  return (
    <section id="how" className="bg-bg-primary">
      <div className="mx-auto max-w-[1080px] px-8 py-16 border-t-[0.5px] border-border-secondary">
        <EditableRichText
          field={eyebrow}
          className="prose mb-3.5 [&_p]:text-[11px] [&_p]:font-medium [&_p]:tracking-[0.10em] [&_p]:uppercase [&_p]:text-text-brand-primary [&_p]:m-0"
        />
        <EditableRichText
          field={headline}
          className="mb-6
            [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-text-primary [&_h2]:m-0
            [&_h2]:max-w-[22ch]
            [&_h2]:!text-[clamp(28px,3.6vw,40px)] [&_h2]:!leading-[1.1] [&_h2]:!tracking-[-0.02em]"
        />
        <EditableList
          field={steps}
          itemSchema={schema.steps.itemSchema}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8"
          renderItem={(step) => (
            <div className="h-full bg-bg-secondary border-[0.5px] border-border-primary rounded-lg px-[26px] py-6">
              <EditableRichText
                field={step.number}
                as="div"
                className="font-mono text-[11px] tracking-[0.10em] text-text-brand-primary uppercase"
              />
              <EditableRichText
                field={step.title}
                className="mt-3.5 mb-2.5
                  [&_h3]:font-display [&_h3]:font-medium [&_h3]:!text-[20px] [&_h3]:!leading-tight [&_h3]:tracking-[-0.02em] [&_h3]:text-text-primary [&_h3]:m-0
                  [&_p]:font-display [&_p]:font-medium [&_p]:!text-[20px] [&_p]:!leading-tight [&_p]:tracking-[-0.02em] [&_p]:text-text-primary [&_p]:m-0"
              />
              <EditableRichText
                field={step.description}
                className="prose [&_p]:text-sm [&_p]:leading-[1.65] [&_p]:text-text-secondary [&_p]:m-0"
              />
            </div>
          )}
        />
      </div>
    </section>
  )
}
