'use client'

import { EditableRichText } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'

interface Props {
  readonly body: EditableSlot<'richText', string>
}

export function ArticleBodyComponent({ body }: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[720px] px-8 py-12">
        <EditableRichText
          field={body}
          className="
            [&_p]:m-0 [&_p]:mt-4 [&_p]:text-[18px] [&_p]:leading-[1.75] [&_p]:text-ink-2
            [&_h2]:m-0 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[32px] [&_h2]:leading-[1.15] [&_h2]:tracking-[-0.02em]
            [&_h3]:m-0 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:text-[24px] [&_h3]:leading-[1.2] [&_h3]:tracking-[-0.015em]
            [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-ink-2
            [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-ink-2
            [&_li]:my-1.5 [&_li]:text-[18px] [&_li]:leading-[1.65] [&_li]:text-ink-2
            [&_blockquote]:my-8 [&_blockquote]:border-l-2 [&_blockquote]:border-ink [&_blockquote]:pl-6 [&_blockquote]:text-[22px] [&_blockquote]:italic [&_blockquote]:leading-[1.5] [&_blockquote]:text-ink
            [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4
            [&_strong]:font-semibold [&_strong]:text-ink
            [&_code]:rounded-sm [&_code]:bg-paper-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[14px] [&_code]:text-ink
          "
        />
      </div>
    </section>
  )
}
