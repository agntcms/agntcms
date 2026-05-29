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
import { schema } from './schema'

type Plan = SlotItem<typeof schema.plans.itemSchema>

interface Props {
  readonly plans: EditableSlot<'list', ReadonlyArray<Plan>>
}

export function PricingPlansComponent({ plans }: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-24">
        <EditableList
          field={plans}
          itemSchema={schema.plans.itemSchema}
          className="grid grid-cols-1 gap-5 lg:grid-cols-3"
          renderItem={(plan) => {
            const featured = read(plan.featured)
            const cta = read(plan.cta)
            const ctaHref = hrefOf(cta)
            const showCta = Boolean(ctaHref) || isSlotInPreview(plan.cta)
            const borderClass = featured ? 'border-ink' : 'border-hairline'
            const ctaStyles = featured
              ? 'bg-ink text-paper border-ink hover:bg-ink-2 hover:border-ink-2'
              : 'bg-transparent text-ink border-hairline-2 hover:border-ink'
            return (
              <div className={`relative flex h-full flex-col border bg-transparent p-8 ${borderClass}`}>
                {featured ? (
                  <span className="absolute -top-px -left-px bg-ink px-2.5 py-[5px] font-mono text-[10px] font-medium tracking-[0.07em] uppercase text-paper">
                    most popular
                  </span>
                ) : null}
                <EditableText
                  field={plan.name}
                  as="h3"
                  className={`m-0 font-mono text-[16px] font-medium tracking-[0.04em] uppercase text-ink-3 ${featured ? 'mt-5' : ''}`}
                />
                <div className="mt-3.5 flex items-baseline gap-2">
                  <EditableText
                    field={plan.price}
                    as="span"
                    className="font-display text-[56px] font-semibold leading-none tracking-[-0.03em] text-ink"
                  />
                  <EditableText
                    field={plan.priceSub}
                    as="span"
                    className="font-mono text-[13px] text-ink-3"
                  />
                </div>
                <EditableRichText
                  field={plan.pitch}
                  className="mt-2.5 [&_p]:m-0 [&_p]:text-[14.5px] [&_p]:leading-[1.55] [&_p]:text-ink-3"
                />
                {showCta && (
                  <a
                    href={ctaHref || '#'}
                    target={isExternalLink(cta) ? '_blank' : undefined}
                    rel={isExternalLink(cta) ? 'noreferrer' : undefined}
                    className="mt-6 block"
                  >
                    <EditableLink
                      field={plan.cta}
                      className={`inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-sm border px-[22px] py-[13px] text-[15px] font-medium no-underline transition-colors duration-200 ease-out ${ctaStyles}`}
                    />
                  </a>
                )}
                <EditableList
                  field={plan.features}
                  itemSchema={schema.plans.itemSchema.features.itemSchema}
                  className="mt-7 flex list-none flex-col gap-2.5 border-t border-hairline p-0 pt-6"
                  renderItem={(f) => (
                    <div className="flex items-start gap-3 text-[14.5px] leading-[1.55] text-ink-2">
                      <span className="flex-shrink-0 font-mono text-ink-3">→</span>
                      <EditableRichText
                        field={f.item}
                        className="[&_p]:m-0 [&_p]:text-[14.5px] [&_p]:leading-[1.55] [&_p]:text-ink-2"
                      />
                    </div>
                  )}
                />
              </div>
            )
          }}
        />
      </div>
    </section>
  )
}
