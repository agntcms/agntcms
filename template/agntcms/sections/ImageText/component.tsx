'use client'

import { EditableRichText, EditableImage, EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { ImageValue, LinkValue } from '@agntcms/next'

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly body: EditableSlot<'richText', string>
  readonly image: EditableSlot<'image', ImageValue>
  readonly imagePosition: EditableSlot<'text', string>
  readonly background: EditableSlot<'text', string>
  readonly primaryCta: EditableSlot<'link', LinkValue>
  readonly secondaryCta: EditableSlot<'link', LinkValue>
}

function CtaButton({
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
      ? 'bg-ink text-paper border-ink hover:bg-ink-2 hover:border-ink-2'
      : 'bg-transparent text-ink border-hairline-2 hover:border-ink'
  return (
    <a
      href={href || '#'}
      target={isExternalLink(link) ? '_blank' : undefined}
      rel={isExternalLink(link) ? 'noreferrer' : undefined}
    >
      <EditableLink
        field={field}
        className={`inline-flex items-center gap-2 whitespace-nowrap rounded-sm border px-[18px] py-[10px] text-sm font-medium no-underline transition-colors duration-200 ease-out ${styles}`}
      />
    </a>
  )
}

export function ImageTextComponent({
  eyebrow,
  headline,
  body,
  image,
  imagePosition,
  background,
  primaryCta,
  secondaryCta,
}: Props) {
  const position = (read(imagePosition) || 'left').trim()
  const bg = (read(background) || 'paper').trim()
  const bgClass = bg === 'paper-2' ? 'bg-paper-2' : 'bg-paper'

  const imageBlock = (
    <div className="aspect-[4/3] overflow-hidden border border-hairline bg-paper-2">
      <EditableImage
        field={image}
        className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
      />
    </div>
  )

  const textBlock = (
    <div>
      <EditableRichText
        field={eyebrow}
        className="[&_p]:font-mono [&_p]:font-medium [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
      />
      <div className="mt-3 [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[40px] [&_h2]:leading-[1.1] [&_h2]:tracking-[-0.025em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[40px] [&_p]:leading-[1.1] [&_p]:tracking-[-0.025em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
        <EditableRichText field={headline} />
      </div>
      <EditableRichText
        field={body}
        className="mt-4 [&_p]:m-0 [&_p]:text-[16.5px] [&_p]:leading-[1.65] [&_p]:text-ink-2 [&_p+p]:mt-3"
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <CtaButton field={primaryCta} variant="primary" />
        <CtaButton field={secondaryCta} variant="secondary" />
      </div>
    </div>
  )

  return (
    <section className={bgClass}>
      <div className="mx-auto w-full max-w-[1280px] px-8 py-20">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          {position === 'right' ? (
            <>
              {textBlock}
              {imageBlock}
            </>
          ) : (
            <>
              {imageBlock}
              {textBlock}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
