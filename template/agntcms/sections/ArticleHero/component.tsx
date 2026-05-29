'use client'

import { EditableText, EditableImage, EditableLink, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { ImageValue, LinkValue } from '@agntcms/next'

interface Props {
  readonly backLink: EditableSlot<'link', LinkValue>
  readonly category: EditableSlot<'text', string>
  readonly title: EditableSlot<'text', string>
  readonly authorName: EditableSlot<'text', string>
  readonly authorPhoto: EditableSlot<'image', ImageValue>
  readonly meta: EditableSlot<'text', string>
  readonly coverImage: EditableSlot<'image', ImageValue>
}

export function ArticleHeroComponent({
  backLink,
  category,
  title,
  authorName,
  authorPhoto,
  meta,
  coverImage,
}: Props) {
  const back = read(backLink)
  const backHref = hrefOf(back)
  const showBack = Boolean(backHref) || isSlotInPreview(backLink)
  const cover = read(coverImage)
  const hasCover = Boolean(cover?.filename) || isSlotInPreview(coverImage)

  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[720px] px-8 pt-16 pb-8">
        {showBack && (
          <a
            href={backHref || '#'}
            target={isExternalLink(back) ? '_blank' : undefined}
            rel={isExternalLink(back) ? 'noreferrer' : undefined}
            className="font-mono text-xs tracking-[0.04em] text-ink-3 no-underline"
          >
            ←{' '}
            <EditableLink field={backLink} className="text-ink-3 no-underline" />
          </a>
        )}
        <div className="mt-6">
          <EditableText
            field={category}
            as="span"
            className="font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
          />
          <EditableText
            field={title}
            as="h1"
            className="mt-3 font-display text-[56px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink"
          />
          <div className="mt-5 flex items-center gap-3">
            <EditableImage
              field={authorPhoto}
              className="!block h-9 w-9 rounded-full object-cover grayscale [&_img]:h-9 [&_img]:w-9 [&_img]:rounded-full [&_img]:object-cover [&_img]:grayscale"
            />
            <div className="text-sm text-ink-2">
              <EditableText
                field={authorName}
                as="b"
                className="font-semibold text-ink"
              />{' '}
              ·{' '}
              <EditableText field={meta} as="span" />
            </div>
          </div>
        </div>
      </div>
      {hasCover ? (
        <div className="mx-auto mt-8 w-full max-w-[720px] px-8">
          <div className="aspect-[16/9] overflow-hidden border border-hairline bg-paper-2">
            <EditableImage
              field={coverImage}
              className="!block h-full w-full object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover"
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}
