'use client'

import {
  EditableRichText,
  EditableText,
  EditableImage,
  EditableList,
  read,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Person = SlotItem<typeof schema.people.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly columns: EditableSlot<'text', string>
  readonly people: EditableSlot<'list', ReadonlyArray<Person>>
}

export function TeamGridComponent({ eyebrow, headline, lead, columns, people }: Props) {
  const cols = read(columns) === '3' ? 3 : 4
  const colClass = cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'

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
          <EditableRichText
            field={lead}
            className="mt-4 max-w-[580px] [&_p]:text-[18px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0"
          />
        </div>
        <EditableList
          field={people}
          itemSchema={schema.people.itemSchema}
          className={`mt-12 grid grid-cols-1 border-t border-l border-hairline ${colClass}`}
          renderItem={(p) => (
            <div className="flex h-full flex-col border-r border-b border-hairline -mr-px -mb-px">
              <div className="aspect-square overflow-hidden border-b border-hairline bg-paper-2">
                <EditableImage
                  field={p.photo}
                  className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                />
              </div>
              <div className="p-6">
                <EditableText
                  field={p.name}
                  as="h4"
                  className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-ink"
                />
                <EditableText
                  field={p.role}
                  as="div"
                  className="mt-1 font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3"
                />
                <EditableRichText
                  field={p.bio}
                  className="mt-2.5 [&_p]:m-0 [&_p]:text-[14px] [&_p]:leading-[1.55] [&_p]:text-ink-3"
                />
              </div>
            </div>
          )}
        />
      </div>
    </section>
  )
}
