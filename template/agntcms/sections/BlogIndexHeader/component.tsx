'use client'

import { EditableRichText, EditableText, EditableList } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Category = SlotItem<typeof schema.categories.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly categories: EditableSlot<'list', ReadonlyArray<Category>>
}

export function BlogIndexHeaderComponent({ eyebrow, headline, lead, categories }: Props) {
  return (
    <section className="bg-paper-2 border-b border-hairline">
      <div className="mx-auto w-full max-w-[1280px] px-8 pt-[88px] pb-8">
        <EditableRichText
          field={eyebrow}
          className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
        />
        <div className="mt-3 max-w-[720px] [&_h1]:m-0 [&_h1]:font-display [&_h1]:font-semibold [&_h1]:text-ink [&_h1]:text-[72px] [&_h1]:leading-[1.05] [&_h1]:tracking-[-0.03em] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[72px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[72px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
          <EditableRichText field={headline} />
        </div>
        <EditableRichText
          field={lead}
          className="mt-5 max-w-[620px] [&_p]:m-0 [&_p]:text-[19px] [&_p]:leading-[1.55] [&_p]:text-ink-2"
        />
        <EditableList
          field={categories}
          itemSchema={schema.categories.itemSchema}
          className="mt-8 flex flex-wrap gap-2"
          renderItem={(c) => (
            <span className="inline-flex items-center border border-hairline bg-transparent px-3.5 py-[7px] font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-2">
              <EditableText field={c.label} as="span" />
            </span>
          )}
        />
      </div>
    </section>
  )
}
