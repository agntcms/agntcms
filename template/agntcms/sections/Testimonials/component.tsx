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
  readonly items: EditableSlot<'list', ReadonlyArray<Item>>
}

export function TestimonialsComponent({ eyebrow, headline, items }: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
        <div className="max-w-[720px]">
          <EditableRichText
            field={eyebrow}
            className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
          />
          <div className="mt-3 [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[44px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[44px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
            <EditableRichText field={headline} />
          </div>
        </div>
        <EditableList
          field={items}
          itemSchema={schema.items.itemSchema}
          className="mt-12 grid grid-cols-1 border-t border-hairline lg:grid-cols-2"
          renderItem={(t, index) => {
            const number = String(index + 1).padStart(2, '0')
            const odd = index % 2 === 0
            return (
              <figure
                className={`m-0 flex flex-col gap-4 border-b border-hairline p-8 pl-0 ${odd ? 'lg:border-r lg:pl-0 lg:pr-8' : 'lg:pl-8 lg:pr-0'}`}
              >
                <span className="font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3">
                  quote · {number}
                </span>
                <EditableRichText
                  field={t.quote}
                  className="[&_p]:m-0 [&_p]:text-[19px] [&_p]:leading-[1.45] [&_p]:tracking-[-0.01em] [&_p]:text-ink"
                />
                <figcaption className="mt-auto flex items-center gap-3">
                  <EditableImage
                    field={t.photo}
                    className="!block h-9 w-9 rounded-full object-cover grayscale [&_img]:h-9 [&_img]:w-9 [&_img]:rounded-full [&_img]:object-cover [&_img]:grayscale"
                  />
                  <div>
                    <EditableText
                      field={t.name}
                      as="div"
                      className="text-sm font-semibold text-ink"
                    />
                    <EditableText
                      field={t.role}
                      as="div"
                      className="font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3"
                    />
                  </div>
                </figcaption>
              </figure>
            )
          }}
        />
      </div>
    </section>
  )
}
