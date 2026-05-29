'use client'

import { EditableText, EditableRichText, EditableList, read } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Column = SlotItem<typeof schema.columns.itemSchema>

interface Props {
  readonly brandName: EditableSlot<'text', string>
  readonly showCaret: EditableSlot<'boolean', boolean>
  readonly tagline: EditableSlot<'richText', string>
  readonly columns: EditableSlot<'list', ReadonlyArray<Column>>
  readonly copyright: EditableSlot<'text', string>
  readonly versionLine: EditableSlot<'text', string>
}

export function SiteFooterComponent({
  brandName,
  showCaret,
  tagline,
  columns,
  copyright,
  versionLine,
}: Props) {
  const caret = read(showCaret)
  return (
    <footer className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 pt-20 pb-10">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <span className="inline-flex items-center font-mono text-[18px] font-semibold tracking-[-0.01em] text-ink">
              <EditableText field={brandName} as="span" />
              {caret ? (
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block h-[14px] w-[7px] bg-teal animate-caret-blink"
                />
              ) : null}
            </span>
            <EditableRichText
              field={tagline}
              className="mt-3.5 max-w-[280px] [&_p]:m-0 [&_p]:text-sm [&_p]:leading-[1.6] [&_p]:text-ink-3"
            />
          </div>
          <EditableList
            field={columns}
            itemSchema={schema.columns.itemSchema}
            className="contents"
            renderItem={(col) => (
              <div>
                <EditableText
                  field={col.heading}
                  as="div"
                  className="mb-3 font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
                />
                <EditableList
                  field={col.links}
                  itemSchema={schema.columns.itemSchema.links.itemSchema}
                  className="flex flex-col gap-2"
                  renderItem={(item) => {
                    const link = read(item.link)
                    const href = hrefOf(link) || '#'
                    return (
                      <a
                        href={href}
                        target={isExternalLink(link) ? '_blank' : undefined}
                        rel={isExternalLink(link) ? 'noreferrer' : undefined}
                        className="text-sm text-ink-2 no-underline hover:text-ink"
                      >
                        <EditableText field={item.label} as="span" />
                      </a>
                    )
                  }}
                />
              </div>
            )}
          />
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-hairline pt-6 font-mono text-xs text-ink-3 md:flex-row md:justify-between md:items-center">
          <EditableText field={copyright} as="span" />
          <EditableText field={versionLine} as="span" />
        </div>
      </div>
    </footer>
  )
}
