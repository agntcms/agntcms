'use client'

import { EditableRichText, EditableList, read } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type WhatIsBuiltItem = SlotItem<typeof schema.items.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly intro: EditableSlot<'richText', string>
  readonly items: EditableSlot<'list', ReadonlyArray<WhatIsBuiltItem>>
}

function pillClasses(status: string): string {
  if (status === 'shipped') {
    return 'bg-bg-brand-primary text-text-brand-primary'
  }
  if (status === 'wip') {
    return 'bg-[#2a2410] text-[#c9a700]'
  }
  return 'bg-bg-primary text-text-secondary border-[0.5px] border-border-primary'
}

function pillLabel(status: string): string {
  if (status === 'shipped') return 'shipped'
  if (status === 'wip') return 'in progress'
  return 'next'
}

export function WhatIsBuiltComponent({ eyebrow, headline, intro, items }: Props) {
  return (
    <section id="built" className="bg-bg-primary">
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
        <EditableRichText
          field={intro}
          className="prose max-w-[60ch] mb-7 [&_p]:text-text-primary [&_p]:m-0"
        />

        <EditableList
          field={items}
          itemSchema={schema.items.itemSchema}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
          renderItem={(item) => {
            const status = read(item.status)
            return (
              <div className="flex gap-3 items-start h-full bg-bg-secondary border-[0.5px] border-border-primary rounded-lg px-4 py-3.5">
                <span
                  className={[
                    'font-mono text-[10px] tracking-[0.06em] uppercase',
                    'px-2 py-0.5 rounded-[3px] flex-shrink-0 mt-px',
                    pillClasses(status),
                  ].join(' ')}
                >
                  {pillLabel(status)}
                </span>
                <div className="text-sm leading-[1.5]">
                  <EditableRichText
                    field={item.label}
                    className="prose [&_p]:m-0 [&_p]:font-medium [&_p]:text-text-primary"
                  />
                  <EditableRichText
                    field={item.description}
                    className="prose mt-0.5 [&_p]:m-0 [&_p]:text-text-secondary [&_p]:text-[13px]"
                  />
                </div>
              </div>
            )
          }}
        />
      </div>
    </section>
  )
}
