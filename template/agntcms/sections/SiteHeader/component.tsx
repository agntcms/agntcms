'use client'

import { EditableText, EditableLink, EditableList, read, isSlotInPreview } from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'
import { schema } from './schema'

type NavItem = SlotItem<typeof schema.navItems.itemSchema>

interface Props {
  readonly brandName: EditableSlot<'text', string>
  readonly showCaret: EditableSlot<'boolean', boolean>
  readonly navItems: EditableSlot<'list', ReadonlyArray<NavItem>>
  readonly signInCta: EditableSlot<'link', LinkValue>
  readonly primaryCta: EditableSlot<'link', LinkValue>
}

function HeaderCta({
  field,
  variant,
}: {
  field: EditableSlot<'link', LinkValue>
  variant: 'ghost' | 'primary'
}) {
  const link = read(field)
  const href = hrefOf(link)
  const show = Boolean(href) || isSlotInPreview(field)
  if (!show) return null
  const styles =
    variant === 'primary'
      ? 'bg-ink text-paper border-ink hover:bg-ink-2 hover:border-ink-2'
      : 'bg-transparent text-ink border-transparent hover:text-ink-3'
  return (
    <a
      href={href || '#'}
      target={isExternalLink(link) ? '_blank' : undefined}
      rel={isExternalLink(link) ? 'noreferrer' : undefined}
    >
      <EditableLink
        field={field}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-3 py-[7px] text-[13px] font-medium no-underline transition-colors duration-200 ease-out ${styles}`}
      />
    </a>
  )
}

export function SiteHeaderComponent({
  brandName,
  showCaret,
  navItems,
  signInCta,
  primaryCta,
}: Props) {
  const caret = read(showCaret)
  return (
    <header className="sticky top-0 z-50 bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8">
        <div className="flex items-center gap-7 py-[18px]">
          <a
            href="/"
            aria-label="Home"
            className="inline-flex items-center font-mono text-[18px] font-semibold tracking-[-0.01em] text-ink no-underline"
          >
            <EditableText field={brandName} as="span" />
            {caret ? (
              <span
                aria-hidden="true"
                className="ml-1 inline-block h-[14px] w-[7px] bg-teal animate-caret-blink"
              />
            ) : null}
          </a>
          <EditableList
            field={navItems}
            itemSchema={schema.navItems.itemSchema}
            className="hidden md:flex items-center gap-[22px] ml-3"
            renderItem={(item) => {
              const link = read(item.link)
              const href = hrefOf(link)
              return (
                <a
                  href={href || '#'}
                  target={isExternalLink(link) ? '_blank' : undefined}
                  rel={isExternalLink(link) ? 'noreferrer' : undefined}
                  className="border-b border-transparent pb-0.5 text-sm font-medium text-ink-3 no-underline hover:text-ink"
                >
                  <EditableText field={item.label} as="span" />
                </a>
              )
            }}
          />
          <div className="flex-1" />
          <HeaderCta field={signInCta} variant="ghost" />
          <HeaderCta field={primaryCta} variant="primary" />
        </div>
      </div>
    </header>
  )
}
