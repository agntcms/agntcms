'use client'

import {
  EditableRichText,
  EditableText,
  EditableImage,
  EditableList,
  read,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import { schema } from './schema'

type Article = SlotItem<typeof schema.articles.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly columns: EditableSlot<'text', string>
  readonly articles: EditableSlot<'list', ReadonlyArray<Article>>
}

export function FeaturedArticlesComponent({
  eyebrow,
  headline,
  lead,
  columns,
  articles,
}: Props) {
  const cols = read(columns) === '4' ? 4 : 3
  const colClass = cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

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
          field={articles}
          itemSchema={schema.articles.itemSchema}
          className={`mt-12 grid grid-cols-1 border-t border-hairline ${colClass}`}
          renderItem={(a) => {
            const link = read(a.link)
            const href = hrefOf(link) || '#'
            return (
              <a
                href={href}
                target={isExternalLink(link) ? '_blank' : undefined}
                rel={isExternalLink(link) ? 'noreferrer' : undefined}
                className="flex h-full flex-col border-b border-r border-hairline -mr-px last:mr-0"
              >
                <div className="aspect-[3/2] overflow-hidden border-b border-hairline bg-paper-2">
                  <EditableImage
                    field={a.image}
                    className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <EditableText
                    field={a.category}
                    as="span"
                    className="font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
                  />
                  <EditableText
                    field={a.title}
                    as="h4"
                    className="mt-2.5 mb-2 text-[19px] font-semibold leading-[1.3] tracking-[-0.015em] text-ink"
                  />
                  <EditableRichText
                    field={a.excerpt}
                    className="[&_p]:m-0 [&_p]:text-[14px] [&_p]:leading-[1.55] [&_p]:text-ink-3"
                  />
                  <EditableText
                    field={a.meta}
                    as="div"
                    className="mt-auto pt-3.5 font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3"
                  />
                </div>
              </a>
            )
          }}
        />
      </div>
    </section>
  )
}
