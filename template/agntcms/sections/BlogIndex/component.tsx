'use client'

import {
  EditableImage,
  EditableList,
  EditableRichText,
  read,
} from '@agntcms/next/client'
import type { EditableSlot, SlotItem } from '@agntcms/next/client'
import { schema } from './schema'

type Post = SlotItem<typeof schema.posts.itemSchema>

interface PostMetaProps {
  readonly category: EditableSlot<'richText', string>
  readonly publishedAt: EditableSlot<'richText', string>
  readonly readingTime: EditableSlot<'richText', string>
}

function PostMeta({ category, publishedAt, readingTime }: PostMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-tertiary">
      <EditableRichText
        field={category}
        as="span"
        className="text-[11px] font-medium uppercase tracking-[0.10em] text-text-brand-primary"
      />
      <EditableRichText field={publishedAt} as="span" />
      {read(readingTime) && (
        <>
          <span aria-hidden="true">·</span>
          <EditableRichText field={readingTime} as="span" />
        </>
      )}
    </div>
  )
}

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly intro: EditableSlot<'richText', string>
  readonly posts: EditableSlot<'list', ReadonlyArray<Post>>
}

export function BlogIndexComponent({ eyebrow, headline, intro, posts }: Props) {
  return (
    <section className="bg-bg-primary">
      <div className="mx-auto w-full max-w-[1080px] px-8 pt-24 pb-24">
        <EditableRichText
          field={eyebrow}
          as="div"
          className="mb-4 text-[11px] font-medium uppercase tracking-[0.10em] text-text-brand-primary"
        />
        <EditableRichText
          field={headline}
          className="
            mb-6
            [&_h1]:m-0 [&_h1]:font-display [&_h1]:font-medium [&_h1]:text-text-primary
            [&_h1]:max-w-[18ch]
            [&_h1]:!text-[clamp(40px,6vw,72px)] [&_h1]:!leading-[1.02] [&_h1]:!tracking-[-0.04em]
          "
        />
        <EditableRichText
          field={intro}
          className="
            mb-16 max-w-[60ch]
            [&_p]:m-0 [&_p]:text-[18px] [&_p]:leading-[1.6] [&_p]:text-text-secondary
          "
        />

        <EditableList
          field={posts}
          itemSchema={schema.posts.itemSchema}
          renderItem={(post, index) => {
            // Static helpers (PostMeta, the article href) need bare values;
            // editable components receive the slot directly. `read()` is
            // the canonical helper for the bare-value path (see
            // EDITABILITY_DESIGN.md author migration).
            const href = read(post.href) || '#'
            if (index === 0) {
              return (
                <a href={href} className="group block mb-16 no-underline">
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12 md:items-center">
                    <div className="overflow-hidden rounded-xl border-[0.5px] border-border-primary bg-bg-secondary">
                      <EditableImage
                        field={post.cover}
                        className="block aspect-[4/3] w-full object-cover"
                      />
                    </div>
                    <div>
                      <PostMeta
                        category={post.category}
                        publishedAt={post.publishedAt}
                        readingTime={post.readingTime}
                      />
                      <EditableRichText
                        field={post.title}
                        className="
                          mt-4 mb-4 font-display font-medium text-text-primary
                          [&_h2]:m-0 [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-text-primary
                          [&_h2]:text-[clamp(24px,3vw,32px)] [&_h2]:leading-[1.15] [&_h2]:tracking-[-0.02em]
                          [&_p]:m-0 [&_p]:font-display [&_p]:font-medium [&_p]:text-text-primary
                          [&_p]:text-[clamp(24px,3vw,32px)] [&_p]:leading-[1.15] [&_p]:tracking-[-0.02em]
                          group-hover:text-text-brand-primary transition-colors
                        "
                      />
                      <EditableRichText
                        field={post.summary}
                        className="
                          mb-5 max-w-[52ch]
                          [&_p]:m-0 [&_p]:text-[16px] [&_p]:leading-[1.6] [&_p]:text-text-secondary
                        "
                      />
                      <EditableRichText
                        field={post.author}
                        as="div"
                        className="text-[13px] text-text-tertiary"
                      />
                    </div>
                  </div>
                </a>
              )
            }

            const isFirstInGrid = index === 1
            return (
              <div
                className={
                  isFirstInGrid
                    ? 'border-t-[0.5px] border-border-primary pt-12'
                    : ''
                }
              >
                <a href={href} className="group block no-underline">
                  <div className="mb-5 overflow-hidden rounded-lg border-[0.5px] border-border-primary bg-bg-secondary">
                    <EditableImage
                      field={post.cover}
                      className="block aspect-[16/9] w-full object-cover"
                    />
                  </div>
                  <PostMeta
                    category={post.category}
                    publishedAt={post.publishedAt}
                    readingTime={post.readingTime}
                  />
                  <EditableRichText
                    field={post.title}
                    className="
                      mt-3 mb-3 font-display font-medium text-text-primary
                      [&_h3]:m-0 [&_h3]:font-display [&_h3]:font-medium [&_h3]:text-text-primary
                      [&_h3]:text-[22px] [&_h3]:leading-[1.2] [&_h3]:tracking-[-0.01em]
                      [&_p]:m-0 [&_p]:font-display [&_p]:font-medium [&_p]:text-text-primary
                      [&_p]:text-[22px] [&_p]:leading-[1.2] [&_p]:tracking-[-0.01em]
                      group-hover:text-text-brand-primary transition-colors
                    "
                  />
                  <EditableRichText
                    field={post.summary}
                    className="
                      [&_p]:m-0 [&_p]:text-[15px] [&_p]:leading-[1.6] [&_p]:text-text-secondary
                    "
                  />
                </a>
              </div>
            )
          }}
          className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 [&>*:first-child]:md:col-span-2"
        />
      </div>
    </section>
  )
}
