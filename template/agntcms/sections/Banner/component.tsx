'use client'

import { EditableRichText, EditableImage, EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { ImageValue, LinkValue } from '@agntcms/next'

interface Props {
  readonly headline: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly primaryCta: EditableSlot<'link', LinkValue>
  readonly secondaryCta: EditableSlot<'link', LinkValue>
  readonly image: EditableSlot<'image', ImageValue>
}

function Cta({
  field,
  variant,
}: {
  field: EditableSlot<'link', LinkValue>
  variant: 'primary' | 'secondary'
}) {
  const link = read(field)
  const href = hrefOf(link)
  const show = Boolean(href) || isSlotInPreview(field)
  if (!show) return null
  const styles =
    variant === 'primary'
      ? 'bg-paper text-ink border-paper hover:bg-paper-2 hover:border-paper-2'
      : 'bg-transparent text-paper border-paper/25 hover:border-paper'
  return (
    <a
      href={href || '#'}
      target={isExternalLink(link) ? '_blank' : undefined}
      rel={isExternalLink(link) ? 'noreferrer' : undefined}
    >
      <EditableLink
        field={field}
        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-sm border px-[22px] py-[13px] text-[15px] font-medium no-underline transition-colors duration-200 ease-out ${styles}`}
      />
    </a>
  )
}

export function BannerComponent({
  headline,
  lead,
  primaryCta,
  secondaryCta,
  image,
}: Props) {
  const img = read(image)
  const hasImage = Boolean(img?.filename) || isSlotInPreview(image)
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      {hasImage ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-[40%] opacity-90 grayscale"
        >
          <EditableImage
            field={image}
            className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink to-transparent" />
        </div>
      ) : null}
      <div className="relative mx-auto w-full max-w-[1280px] px-8 py-24 text-center">
        <div className="mx-auto max-w-[820px] [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-paper [&_h2]:text-[56px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-paper [&_p]:text-[56px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-paper/55 [&_em]:font-semibold">
          <EditableRichText field={headline} />
        </div>
        <EditableRichText
          field={lead}
          className="mx-auto mt-4 max-w-[560px] [&_p]:text-[17px] [&_p]:leading-[1.55] [&_p]:text-paper/65 [&_p]:m-0"
        />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Cta field={primaryCta} variant="primary" />
          <Cta field={secondaryCta} variant="secondary" />
        </div>
      </div>
    </section>
  )
}
