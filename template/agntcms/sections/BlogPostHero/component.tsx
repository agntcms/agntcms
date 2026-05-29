'use client'

import {
  EditableImage,
  EditableList,
  EditableRichText,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'
import { schema } from './schema'

type Tag = SlotItem<typeof schema.tags.itemSchema>

interface Props {
  readonly category: EditableSlot<'richText', string>
  readonly title: EditableSlot<'richText', string>
  readonly summary: EditableSlot<'richText', string>
  readonly author: EditableSlot<'richText', string>
  readonly publishedAt: EditableSlot<'richText', string>
  readonly readingTime: EditableSlot<'richText', string>
  readonly cover: EditableSlot<'image', ImageValue>
  readonly tags: EditableSlot<'list', ReadonlyArray<Tag>>
}

export function BlogPostHeroComponent({
  category,
  title,
  summary,
  author,
  publishedAt,
  readingTime,
  cover,
  tags,
}: Props) {
  return (
    <section className="bg-bg-primary">
      <div className="mx-auto w-full max-w-[920px] px-8 pt-24 pb-12">
        <EditableRichText
          field={category}
          as="div"
          className="mb-6 text-[11px] font-medium uppercase tracking-[0.10em] text-text-brand-primary"
        />
        <EditableRichText
          field={title}
          className="
            mb-6
            [&_h1]:m-0 [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-text-primary
            [&_h1]:max-w-[22ch]
            [&_h1]:!text-[clamp(34px,5vw,56px)] [&_h1]:!leading-[1.05] [&_h1]:!tracking-[-0.03em]
          "
        />
        <EditableRichText
          field={summary}
          className="
            mb-10 max-w-[60ch]
            [&_p]:m-0 [&_p]:text-[18px] [&_p]:leading-[1.6] [&_p]:text-text-secondary
          "
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-text-secondary">
          <EditableRichText field={author} as="span" className="font-medium text-text-primary" />
          <span className="text-text-tertiary" aria-hidden="true">·</span>
          <EditableRichText field={publishedAt} as="span" />
          <span className="text-text-tertiary" aria-hidden="true">·</span>
          <EditableRichText field={readingTime} as="span" />
        </div>

        <EditableList
          field={tags}
          itemSchema={schema.tags.itemSchema}
          className="mt-5 flex flex-wrap gap-2"
          renderItem={(item) => (
            <span className="inline-flex items-center rounded-sm border-[0.5px] border-border-primary bg-bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.10em] text-text-secondary">
              <EditableRichText field={item.label} as="span" />
            </span>
          )}
        />

        <div className="mt-12 overflow-hidden rounded-xl border-[0.5px] border-border-primary bg-bg-secondary">
          <EditableImage
            field={cover}
            className="block aspect-[16/9] w-full object-cover"
          />
        </div>
      </div>
    </section>
  )
}
