'use client'

import { EditableRichText, EditableList } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Row = SlotItem<typeof schema.rows.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly intro: EditableSlot<'richText', string>
  readonly painLabel: EditableSlot<'richText', string>
  readonly oursLabel: EditableSlot<'richText', string>
  readonly rows: EditableSlot<'list', ReadonlyArray<Row>>
}

export function PainAnswerComponent({ eyebrow, headline, intro, painLabel, oursLabel, rows }: Props) {
  return (
    <section id="vs" className="bg-bg-primary">
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
          className="prose max-w-[60ch] mb-9 [&_p]:text-text-primary [&_p]:m-0"
        />

        <div className="border-t-[0.5px] border-border-primary mt-2">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-2 border-b-[0.5px] border-border-primary">
            <EditableRichText
              field={painLabel}
              className="prose px-6 py-3.5 [&_p]:text-[11px] [&_p]:font-medium [&_p]:tracking-[0.10em] [&_p]:uppercase [&_p]:text-text-secondary [&_p]:m-0"
            />
            <EditableRichText
              field={oursLabel}
              className="prose px-6 py-3.5 border-l-[0.5px] border-border-primary [&_p]:text-[11px] [&_p]:font-medium [&_p]:tracking-[0.10em] [&_p]:uppercase [&_p]:text-text-brand-primary [&_p]:m-0"
            />
          </div>

          <EditableList
            field={rows}
            itemSchema={schema.rows.itemSchema}
            className="contents"
            renderItem={(row, index) => {
              const num = String(index + 1).padStart(2, '0')
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 border-b-[0.5px] border-border-primary">
                  <div className="flex gap-[18px] px-6 py-6 items-start text-text-tertiary">
                    <div className="font-mono text-[11px] tracking-[0.06em] text-text-tertiary mt-[3px] shrink-0 w-[18px]">{num}</div>
                    <EditableRichText
                      field={row.pain}
                      className="prose [&_p]:m-0 [&_p]:text-[15px] [&_p]:leading-[1.55] [&_p]:line-through [&_p]:decoration-text-tertiary [&_p]:decoration-[0.5px]"
                    />
                  </div>
                  <div className="flex gap-[18px] px-6 py-6 items-start bg-bg-secondary border-t-[0.5px] sm:border-t-0 sm:border-l-[0.5px] border-border-primary">
                    <div className="font-mono text-[11px] tracking-[0.06em] text-text-brand-primary mt-[3px] shrink-0 w-[18px]">→</div>
                    <EditableRichText
                      field={row.ours}
                      className="prose [&_p]:m-0 [&_p]:text-[15px] [&_p]:leading-[1.55] [&_p]:text-text-primary"
                    />
                  </div>
                </div>
              )
            }}
          />
        </div>
      </div>
    </section>
  )
}
