'use client'

import {
  EditableRichText,
  EditableText,
  EditableImage,
  EditableList,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Item = SlotItem<typeof schema.items.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly items: EditableSlot<'list', ReadonlyArray<Item>>
}

export function CaseStudiesComponent({ eyebrow, headline, lead, items }: Props) {
  return (
    <section className="bg-paper-2">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
        <div className="max-w-[720px]">
          <EditableRichText
            field={eyebrow}
            className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
          />
          <div className="mt-3 [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[44px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[44px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
            <EditableRichText field={headline} />
          </div>
          <EditableRichText
            field={lead}
            className="mt-4 max-w-[580px] [&_p]:text-[18px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0"
          />
        </div>
        <EditableList
          field={items}
          itemSchema={schema.items.itemSchema}
          className="mt-12 grid grid-cols-1 border-t border-hairline lg:grid-cols-3"
          renderItem={(p) => (
            <div className="block border-b border-r border-hairline -mr-px last:mr-0">
              <div className="aspect-[4/3] overflow-hidden border-b border-hairline bg-paper-3">
                <EditableImage
                  field={p.image}
                  className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                />
              </div>
              <div className="p-6">
                <EditableText
                  field={p.kind}
                  as="span"
                  className="font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
                />
                <EditableText
                  field={p.name}
                  as="h4"
                  className="mt-2.5 mb-1.5 text-[19px] font-semibold tracking-[-0.015em] text-ink"
                />
                <EditableRichText
                  field={p.body}
                  className="[&_p]:m-0 [&_p]:text-[14px] [&_p]:leading-[1.55] [&_p]:text-ink-3"
                />
                <div className="mt-4 flex gap-6 border-t border-hairline pt-4 font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3">
                  <span>
                    <EditableText
                      field={p.metric1Value}
                      as="b"
                      className="font-semibold text-[13px] text-ink"
                    />{' '}
                    ·{' '}
                    <EditableText field={p.metric1Label} as="span" />
                  </span>
                  <span>
                    <EditableText
                      field={p.metric2Value}
                      as="b"
                      className="font-semibold text-[13px] text-ink"
                    />{' '}
                    ·{' '}
                    <EditableText field={p.metric2Label} as="span" />
                  </span>
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </section>
  )
}
