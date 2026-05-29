'use client'

import { useEffect, useRef, useState } from 'react'
import {
  EditableRichText,
  EditableList,
  EditableLink,
  read,
  isSlotInPreview,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'
import { schema } from './schema'

type SidebarGroup = SlotItem<typeof schema.sidebar.itemSchema>
type SidebarItem = SlotItem<typeof schema.sidebar.itemSchema.items.itemSchema>

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface SidebarLinkProps {
  readonly item: SidebarItem
}

function SidebarLink({ item }: SidebarLinkProps) {
  const active = read(item.active)
  const href = read(item.href) || '#'
  return (
    <a
      href={href}
      className={
        active
          ? 'block py-1.5 text-[13.5px] font-medium text-text-brand-primary border-l-2 border-border-brand pl-3 -ml-[2px]'
          : 'block py-1.5 pl-3 -ml-[2px] text-[13.5px] text-gray-500 hover:text-gray-950 transition-colors'
      }
    >
      <EditableRichText field={item.label} as="span" />
    </a>
  )
}

interface Props {
  readonly sidebar: EditableSlot<'list', ReadonlyArray<SidebarGroup>>
  readonly eyebrow: EditableSlot<'richText', string>
  readonly title: EditableSlot<'richText', string>
  readonly lead: EditableSlot<'richText', string>
  readonly body: EditableSlot<'richText', string>
  readonly prev: EditableSlot<'link', LinkValue>
  readonly next: EditableSlot<'link', LinkValue>
}

interface TocEntry {
  readonly id: string
  readonly label: string
  readonly level: 2 | 3
}

export function DocsArticleComponent({
  sidebar,
  eyebrow,
  title,
  lead,
  body,
  prev: rawPrev,
  next: rawNext,
}: Props) {
  const articleRef = useRef<HTMLDivElement>(null)
  const [toc, setToc] = useState<ReadonlyArray<TocEntry>>([])

  const prev = read(rawPrev)
  const next = read(rawNext)
  // Keep the prev/next nav slots clickable in preview even when their
  // link is unconfigured — the `<EditableLink>` inside the `<a>` is the
  // author's only entry point to the link picker. See
  // `isSlotInPreview` JSDoc for the canonical idiom.
  const showPrev = Boolean(hrefOf(prev)) || isSlotInPreview(rawPrev)
  const showNext = Boolean(hrefOf(next)) || isSlotInPreview(rawNext)

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const headings = root.querySelectorAll<HTMLElement>('h2, h3')
    const used = new Set<string>()
    const items: TocEntry[] = []
    headings.forEach((h, i) => {
      const label = (h.textContent || '').trim()
      let id = slugify(label) || `section-${i}`
      let n = 2
      while (used.has(id)) {
        id = `${slugify(label) || `section-${i}`}-${n++}`
      }
      used.add(id)
      h.id = id
      items.push({ id, label, level: h.tagName === 'H2' ? 2 : 3 })
    })
    setToc(items)
    // The TOC depends on the rendered DOM, which depends on the body
    // slot's underlying value. Pass `body` itself so React tracks slot
    // identity changes (preview-mode revisions swap the slot reference).
  }, [body])

  return (
    <section className="bg-gray-50 text-gray-950">
      <div className="mx-auto w-full max-w-[1280px] px-6 lg:px-10">
        <div className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[220px_minmax(0,1fr)_200px] lg:gap-14 lg:py-16">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-10">
              <EditableList
                field={sidebar}
                itemSchema={schema.sidebar.itemSchema}
                className="flex flex-col gap-7"
                renderItem={(group) => (
                  <div>
                    <EditableRichText
                      field={group.title}
                      as="div"
                      className="mb-2 text-[13px] font-medium text-gray-950"
                    />
                    <EditableList
                      field={group.items}
                      itemSchema={schema.sidebar.itemSchema.items.itemSchema}
                      className="flex flex-col border-l-[0.5px] border-gray-200"
                      renderItem={(item) => <SidebarLink item={item} />}
                    />
                  </div>
                )}
              />
            </div>
          </aside>

          {/* Article */}
          <article className="min-w-0 max-w-[760px]">
            <EditableRichText
              field={eyebrow}
              as="div"
              className="mb-4 text-[11px] font-medium uppercase tracking-[0.10em] text-text-brand-primary"
            />
            <EditableRichText
              field={title}
              className="
                mb-5
                [&_h1]:m-0 [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-gray-950
                [&_h1]:!text-[clamp(32px,4.5vw,44px)] [&_h1]:!leading-[1.06] [&_h1]:!tracking-[-0.03em]
              "
            />
            <EditableRichText
              field={lead}
              className="
                mb-12 max-w-[60ch]
                [&_p]:m-0 [&_p]:text-[18px] [&_p]:leading-[1.6] [&_p]:text-gray-500
              "
            />

            <div
              ref={articleRef}
              className="
                [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-gray-950
                [&_h2]:!text-[26px] [&_h2]:!leading-[1.2] [&_h2]:!tracking-[-0.02em]
                [&_h2]:mt-14 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b-[0.5px] [&_h2]:border-gray-200
                [&_h3]:scroll-mt-24 [&_h3]:font-display [&_h3]:font-medium [&_h3]:text-gray-950
                [&_h3]:!text-[19px] [&_h3]:!leading-[1.3] [&_h3]:!tracking-[-0.01em]
                [&_h3]:mt-10 [&_h3]:mb-3
                [&_p]:my-4 [&_p]:text-[15.5px] [&_p]:leading-[1.7] [&_p]:text-gray-950
                [&_a]:text-text-brand-primary [&_a]:underline [&_a]:underline-offset-[3px] hover:[&_a]:no-underline
                [&_strong]:font-medium [&_strong]:text-gray-950
                [&_em]:italic
                [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6
                [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
                [&_li]:my-1.5 [&_li]:text-[15.5px] [&_li]:leading-[1.7] [&_li]:text-gray-950
                [&_li_p]:my-1
                [&_code]:font-mono [&_code]:text-[13px] [&_code]:font-normal
                [&_code]:text-text-brand-primary [&_code]:bg-bg-brand-primary
                [&_code]:px-[6px] [&_code]:py-[2px] [&_code]:rounded-sm
                [&_pre]:my-6 [&_pre]:bg-bg-brand-primary [&_pre]:rounded-lg
                [&_pre]:px-5 [&_pre]:py-4 [&_pre]:overflow-x-auto [&_pre]:overflow-y-hidden
                [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.7]
                [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_pre_code]:rounded-none
                [&_blockquote]:my-6 [&_blockquote]:not-italic
                [&_blockquote]:bg-white [&_blockquote]:border-l-2 [&_blockquote]:border-border-brand
                [&_blockquote]:rounded-r-lg [&_blockquote]:px-5 [&_blockquote]:py-4
                [&_blockquote_p]:m-0 [&_blockquote_p]:text-[15px] [&_blockquote_p]:leading-[1.65] [&_blockquote_p]:text-gray-950
                [&_hr]:my-12 [&_hr]:border-0 [&_hr]:border-t-[0.5px] [&_hr]:border-gray-200
              "
            >
              <EditableRichText field={body} />
            </div>

            {(showPrev || showNext) && (
              <div className="mt-20 grid grid-cols-1 gap-3 border-t-[0.5px] border-gray-200 pt-10 sm:grid-cols-2">
                {showPrev ? (
                  <a
                    href={hrefOf(prev) || '#'}
                    target={isExternalLink(prev) ? '_blank' : undefined}
                    rel={isExternalLink(prev) ? 'noreferrer' : undefined}
                    className="flex flex-col items-start gap-1 rounded-lg border-[0.5px] border-gray-200 bg-white px-5 py-4 transition-colors hover:border-border-brand"
                  >
                    <span className="text-[12px] text-gray-500">← Previous</span>
                    <EditableLink
                      field={rawPrev}
                      className="text-[15px] font-medium text-gray-950"
                    />
                  </a>
                ) : (
                  <span />
                )}
                {showNext ? (
                  <a
                    href={hrefOf(next) || '#'}
                    target={isExternalLink(next) ? '_blank' : undefined}
                    rel={isExternalLink(next) ? 'noreferrer' : undefined}
                    className="flex flex-col items-end gap-1 rounded-lg border-[0.5px] border-gray-200 bg-white px-5 py-4 text-right transition-colors hover:border-border-brand sm:col-start-2"
                  >
                    <span className="text-[12px] text-gray-500">Next →</span>
                    <EditableLink
                      field={rawNext}
                      className="text-[15px] font-medium text-gray-950"
                    />
                  </a>
                ) : (
                  <span />
                )}
              </div>
            )}
          </article>

          {/* Right TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-10">
              {toc.length > 0 && (
                <>
                  <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.10em] text-gray-500">
                    On this page
                  </div>
                  <ul className="flex flex-col">
                    {toc.map((entry) => (
                      <li
                        key={entry.id}
                        className={entry.level === 3 ? 'pl-3' : ''}
                      >
                        <a
                          href={`#${entry.id}`}
                          className="block py-1 text-[13px] text-gray-500 transition-colors hover:text-gray-950"
                        >
                          {entry.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
