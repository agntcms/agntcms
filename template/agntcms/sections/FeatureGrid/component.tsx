'use client'

import {
  EditableRichText,
  EditableText,
  EditableLink,
  EditableList,
  read,
  isSlotInPreview,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'
import { schema } from './schema'

type Card = SlotItem<typeof schema.cards.itemSchema>

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly columns: EditableSlot<'text', string>
  readonly variant: EditableSlot<'text', string>
  readonly cards: EditableSlot<'list', ReadonlyArray<Card>>
  readonly footerCta: EditableSlot<'link', LinkValue>
}

export function FeatureGridComponent({
  eyebrow,
  headline,
  lead,
  columns,
  variant,
  cards,
  footerCta,
}: Props) {
  const cols = read(columns) === '4' ? 4 : 3
  const kind = read(variant) || 'icon'
  const colClass = cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
  const cta = read(footerCta)
  const ctaHref = hrefOf(cta)
  const showCta = Boolean(ctaHref) || isSlotInPreview(footerCta)

  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-24">
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
          field={cards}
          itemSchema={schema.cards.itemSchema}
          className={`mt-14 grid grid-cols-1 ${colClass}`}
          renderItem={(card) => (
            <div className="flex h-full flex-col gap-3 border border-hairline -ml-px -mt-px p-7">
              {kind === 'icon' ? (
                <div
                  className="h-9 w-9 text-ink-2 [&_svg]:h-[22px] [&_svg]:w-[22px]"
                  dangerouslySetInnerHTML={{ __html: read(card.iconSvg) || '' }}
                />
              ) : null}
              {kind === 'stat' ? (
                <EditableText
                  field={card.stat}
                  as="div"
                  className="font-display text-[48px] font-semibold leading-none tracking-[-0.03em] text-ink"
                />
              ) : null}
              {kind === 'step' ? (
                <EditableText
                  field={card.stat}
                  as="div"
                  className="font-mono text-[12px] font-medium tracking-[0.07em] uppercase text-ink-3"
                />
              ) : null}
              <EditableText
                field={card.label}
                as="h4"
                className="m-0 text-[19px] font-semibold tracking-[-0.015em] text-ink"
              />
              <EditableRichText
                field={card.body}
                className="[&_p]:m-0 [&_p]:text-[14.5px] [&_p]:leading-[1.6] [&_p]:text-ink-3 [&_p+p]:mt-2"
              />
            </div>
          )}
        />

        {showCta && (
          <div className="mt-10 text-center">
            <a
              href={ctaHref || '#'}
              target={isExternalLink(cta) ? '_blank' : undefined}
              rel={isExternalLink(cta) ? 'noreferrer' : undefined}
            >
              <EditableLink
                field={footerCta}
                className="inline-flex items-center gap-2 rounded-sm border border-hairline-2 bg-transparent px-[22px] py-[13px] text-[15px] font-medium text-ink no-underline hover:border-ink"
              />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
