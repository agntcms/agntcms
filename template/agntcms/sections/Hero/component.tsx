'use client'

import { EditableRichText, EditableImage, EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { ImageValue, LinkValue } from '@agntcms/next'

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly image: EditableSlot<'image', ImageValue>
  readonly primaryCta: EditableSlot<'link', LinkValue>
  readonly secondaryCta: EditableSlot<'link', LinkValue>
  readonly layout: EditableSlot<'text', string>
  readonly background: EditableSlot<'text', string>
}

const HEADLINE_CLASSES =
  "[&_h1]:font-display [&_h1]:font-semibold [&_h1]:text-ink [&_h1]:m-0 " +
  "[&_h1]:!leading-[1.05] [&_h1]:!tracking-[-0.03em] " +
  "[&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:m-0 " +
  "[&_h2]:!leading-[1.05] [&_h2]:!tracking-[-0.03em] " +
  "[&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:m-0 " +
  "[&_p]:!leading-[1.05] [&_p]:!tracking-[-0.03em] " +
  "[&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold"

function CtaButton({
  field,
  variant,
  size = 'lg',
}: {
  field: EditableSlot<'link', LinkValue>
  variant: 'primary' | 'secondary'
  size?: 'md' | 'lg'
}) {
  const link = read(field)
  const href = hrefOf(link)
  const show = Boolean(href) || isSlotInPreview(field)
  if (!show) return null
  const base =
    'inline-flex items-center gap-2 whitespace-nowrap rounded-sm border transition-colors duration-200 ease-out font-medium no-underline'
  const sizes = size === 'lg' ? 'text-[15px] px-[22px] py-[13px]' : 'text-sm px-[18px] py-[10px]'
  const styles =
    variant === 'primary'
      ? 'bg-ink text-paper border-ink hover:bg-ink-2 hover:border-ink-2'
      : 'bg-transparent text-ink border-hairline-2 hover:border-ink'
  return (
    <a
      href={href || '#'}
      target={isExternalLink(link) ? '_blank' : undefined}
      rel={isExternalLink(link) ? 'noreferrer' : undefined}
    >
      <EditableLink field={field} className={`${base} ${sizes} ${styles}`} />
    </a>
  )
}

export function HeroComponent({
  eyebrow,
  headline,
  lead,
  image,
  primaryCta,
  secondaryCta,
  layout,
  background,
}: Props) {
  const layoutMode = (read(layout) || 'split').trim()
  const bg = (read(background) || 'paper').trim()
  const img = read(image)
  const hasImage = Boolean(img?.filename) || isSlotInPreview(image)
  const bgClass = bg === 'paper-2' ? 'bg-paper-2' : 'bg-paper'

  if (layoutMode === 'split') {
    return (
      <section className={`${bgClass}`}>
        <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <EditableRichText
                field={eyebrow}
                className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
              />
              <div className={`mt-4 ${HEADLINE_CLASSES} [&_h1]:!text-[clamp(40px,6vw,72px)] [&_h2]:!text-[clamp(40px,6vw,72px)] [&_p]:!text-[clamp(40px,6vw,72px)]`}>
                <EditableRichText field={headline} />
              </div>
              <EditableRichText
                field={lead}
                className="mt-5 max-w-[540px] [&_p]:text-[19px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0 [&_p+p]:mt-3"
              />
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <CtaButton field={primaryCta} variant="primary" />
                <CtaButton field={secondaryCta} variant="secondary" />
              </div>
            </div>
            {hasImage ? (
              <div className="aspect-[5/4] overflow-hidden border border-hairline bg-paper-2">
                <EditableImage
                  field={image}
                  className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  // Stacked variants — centered or left-aligned, with optional image below.
  const isCentered = layoutMode === 'stacked-center'
  const alignWrapper = isCentered ? 'mx-auto text-center' : ''
  const alignButtons = isCentered ? 'justify-center' : 'justify-start'
  const leadAlign = isCentered ? 'mx-auto' : ''

  return (
    <section className={`${bgClass}`}>
      <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
        <div className={`max-w-[880px] ${alignWrapper}`}>
          <EditableRichText
            field={eyebrow}
            className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
          />
          <div className={`mt-4 ${HEADLINE_CLASSES} [&_h1]:!text-[clamp(48px,7vw,88px)] [&_h2]:!text-[clamp(48px,7vw,88px)] [&_p]:!text-[clamp(48px,7vw,88px)]`}>
            <EditableRichText field={headline} />
          </div>
          <EditableRichText
            field={lead}
            className={`mt-5 max-w-[640px] ${leadAlign} [&_p]:text-[20px] [&_p]:leading-[1.55] [&_p]:text-ink-2 [&_p]:m-0 [&_p+p]:mt-3`}
          />
          <div className={`mt-8 flex flex-wrap items-center gap-3 ${alignButtons}`}>
            <CtaButton field={primaryCta} variant="primary" />
            <CtaButton field={secondaryCta} variant="secondary" />
          </div>
          {hasImage ? (
            <div className="mt-12 aspect-[16/8] overflow-hidden border border-hairline bg-paper-2">
              <EditableImage
                field={image}
                className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
