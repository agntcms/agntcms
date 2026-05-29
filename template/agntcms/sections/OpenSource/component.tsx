'use client'

import { EditableLink, EditableRichText, EditableList, read } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'
import { schema } from './schema'

type Stat = SlotItem<typeof schema.stats.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly body: EditableSlot<'richText', string>
  readonly stats: EditableSlot<'list', ReadonlyArray<Stat>>
  readonly primaryCta: EditableSlot<'link', LinkValue>
  readonly secondaryCta: EditableSlot<'link', LinkValue>
}

export function OpenSourceComponent({ eyebrow, headline, body, stats, primaryCta: rawPrimary, secondaryCta: rawSecondary }: Props) {
  const primaryCta = read(rawPrimary)
  const secondaryCta = read(rawSecondary)
  return (
    <section id="open-source" className="bg-bg-primary">
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
          field={body}
          className="prose max-w-[60ch]
            [&_p]:text-text-primary [&_p]:m-0 [&_p]:mb-4 [&_p:last-child]:mb-0"
        />

        <EditableList
          field={stats}
          itemSchema={schema.stats.itemSchema}
          className="grid grid-cols-2 md:grid-cols-4 border-[0.5px] border-border-primary rounded-lg my-8 mb-7 bg-bg-secondary overflow-hidden"
          renderItem={(stat, index) => (
            <div
              className={[
                'px-6 py-6',
                'border-r-[0.5px] border-border-primary last:border-r-0',
                index < 2 ? 'border-b-[0.5px] md:border-b-0' : '',
              ].join(' ')}
            >
              <EditableRichText
                field={stat.number}
                as="div"
                className="font-display font-medium text-[32px] tracking-[-0.04em] text-text-brand-primary"
              />
              <EditableRichText
                field={stat.label}
                as="div"
                className="text-xs text-text-secondary mt-1 tracking-[0.04em]"
              />
            </div>
          )}
        />

        <div className="flex gap-2.5 flex-wrap">
          {hrefOf(primaryCta) && (
            <a
              href={hrefOf(primaryCta)}
              target={isExternalLink(primaryCta) ? '_blank' : undefined}
              rel={isExternalLink(primaryCta) ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-2 bg-transparent text-text-primary border-[0.5px] border-border-primary rounded-sm text-[13px] font-medium px-4 py-2 no-underline hover:bg-bg-secondary transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.91-.25 1.89-.38 2.86-.39.97 0 1.95.13 2.86.39 2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.26 5.65.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
              </svg>
              <EditableLink field={rawPrimary} className="no-underline" />
              <span aria-hidden="true">↗</span>
            </a>
          )}
          {hrefOf(secondaryCta) && (
            <a
              href={hrefOf(secondaryCta)}
              target={isExternalLink(secondaryCta) ? '_blank' : undefined}
              rel={isExternalLink(secondaryCta) ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-2 bg-transparent text-text-primary border-[0.5px] border-border-primary rounded-sm text-[13px] font-medium px-4 py-2 no-underline hover:bg-bg-secondary transition-colors"
            >
              <EditableLink field={rawSecondary} className="no-underline" />
              <span aria-hidden="true">→</span>
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
