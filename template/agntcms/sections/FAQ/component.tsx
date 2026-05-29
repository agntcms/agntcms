'use client'

import { EditableRichText, EditableList } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type FaqItem = SlotItem<typeof schema.entries.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly entries: EditableSlot<'list', ReadonlyArray<FaqItem>>
}

export function FAQComponent({ eyebrow, headline, lead, entries }: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[720px] px-8 py-[88px]">
        <EditableRichText
          field={eyebrow}
          className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
        />
        <div className="mt-3 [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[44px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[44px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
          <EditableRichText field={headline} />
        </div>
        <EditableRichText
          field={lead}
          className="mt-4 [&_p]:text-[18px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0"
        />
        <EditableList
          field={entries}
          itemSchema={schema.entries.itemSchema}
          className="mt-8 border-t border-hairline"
          renderItem={(q) => (
            <details className="group border-b border-hairline py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <EditableRichText
                  field={q.question}
                  as="span"
                  className="[&_p]:m-0 [&_p]:text-[17px] [&_p]:font-medium [&_p]:tracking-[-0.01em] [&_p]:text-ink"
                />
                <span className="font-mono text-ink-3 group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <EditableRichText
                field={q.answer}
                className="mt-3 max-w-[620px] [&_p]:m-0 [&_p]:text-[15.5px] [&_p]:leading-[1.6] [&_p]:text-ink-3 [&_p+p]:mt-3"
              />
            </details>
          )}
        />
      </div>
    </section>
  )
}
