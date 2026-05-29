'use client'

import { useState } from 'react'
import {
  EditableRichText,
  EditableImage,
  EditableLink,
  EditableList,
  read,
  isSlotInPreview,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import { schema } from './schema'

type Entry = SlotItem<typeof schema.entries.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly entries: EditableSlot<'list', ReadonlyArray<Entry>>
}

export function TabbedFeaturesComponent({ eyebrow, headline, lead, entries }: Props) {
  const [active, setActive] = useState(0)
  const itemsRaw = read(entries) as ReadonlyArray<unknown> | undefined
  const itemCount = itemsRaw?.length ?? 0
  const safeIndex = itemCount > 0 ? Math.min(Math.max(active, 0), itemCount - 1) : 0

  return (
    <section className="bg-paper-2">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
        <EditableRichText
          field={eyebrow}
          className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
        />
        <div className="mt-3 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:m-0 [&_h2]:text-[44px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:m-0 [&_p]:text-[44px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
          <EditableRichText field={headline} />
        </div>
        <EditableRichText
          field={lead}
          className="mt-4 max-w-[580px] [&_p]:text-[18px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0"
        />

        <div className="mt-10 flex gap-7 border-b border-hairline overflow-x-auto overflow-y-hidden">
          <EditableList
            field={entries}
            itemSchema={schema.entries.itemSchema}
            className="flex"
            renderItem={(entry, index) => {
              const isActive = index === safeIndex
              return (
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 px-0 pb-3.5 pt-3.5 pr-7 text-left text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'border-ink text-ink'
                      : 'border-transparent text-ink-3 hover:border-hairline-2 hover:text-ink-2'
                  }`}
                >
                  <EditableRichText
                    field={entry.headline}
                    as="span"
                    className="[&_p]:m-0 [&_p]:inline"
                  />
                </button>
              )
            }}
          />
        </div>

        <EditableList
          field={entries}
          itemSchema={schema.entries.itemSchema}
          className="mt-10"
          renderItem={(entry, index) => {
            if (index !== safeIndex) return null
            const link = read(entry.cta)
            const href = hrefOf(link)
            const showCta = Boolean(href) || isSlotInPreview(entry.cta)
            return (
              <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:items-center">
                <div>
                  <EditableRichText
                    field={entry.headline}
                    className="[&_h3]:m-0 [&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:text-[32px] [&_h3]:leading-[1.15] [&_h3]:tracking-[-0.02em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[32px] [&_p]:leading-[1.15] [&_p]:tracking-[-0.02em]"
                  />
                  <EditableRichText
                    field={entry.description}
                    className="mt-3.5 [&_p]:m-0 [&_p]:text-[16.5px] [&_p]:leading-[1.6] [&_p]:text-ink-2 [&_p+p]:mt-3"
                  />
                  {showCta && (
                    <div className="mt-5">
                      <a
                        href={href || '#'}
                        target={isExternalLink(link) ? '_blank' : undefined}
                        rel={isExternalLink(link) ? 'noreferrer' : undefined}
                      >
                        <EditableLink
                          field={entry.cta}
                          className="inline-flex items-center gap-2 rounded-sm border border-hairline-2 bg-transparent px-[18px] py-[10px] text-sm font-medium text-ink no-underline hover:border-ink"
                        />
                      </a>
                    </div>
                  )}
                </div>
                <div className="aspect-[5/4] overflow-hidden border border-hairline bg-paper-2">
                  <EditableImage
                    field={entry.image}
                    className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
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
