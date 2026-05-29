'use client'

import { EditableRichText, EditableList, EditableText } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Logo = SlotItem<typeof schema.logos.itemSchema>

interface Props {
  readonly lead: EditableSlot<'richText', string>
  readonly logos: EditableSlot<'list', ReadonlyArray<Logo>>
}

export function LogoStripComponent({ lead, logos }: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-8">
        <EditableRichText
          field={lead}
          className="text-center [&_p]:font-mono [&_p]:font-medium [&_p]:text-[11px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0 [&_p]:mb-5"
        />
        <EditableList
          field={logos}
          itemSchema={schema.logos.itemSchema}
          className="flex flex-wrap items-center justify-between gap-8"
          renderItem={(logo) => (
            <EditableText
              field={logo.name}
              as="span"
              className="font-mono font-medium text-sm tracking-[0.07em] uppercase text-ink-3"
            />
          )}
        />
      </div>
    </section>
  )
}
