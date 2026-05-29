'use client'

import { EditableRichText } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'

interface Props {
  readonly body: EditableSlot<'richText', string>
}

export function BlogPostBodyComponent({ body }: Props) {
  return (
    <section className="bg-bg-primary">
      <div className="mx-auto w-full max-w-[720px] px-8 pb-24">
        <div
          className="
            [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-text-primary
            [&_h2]:!text-[26px] [&_h2]:!leading-[1.2] [&_h2]:!tracking-[-0.02em]
            [&_h2]:mt-14 [&_h2]:mb-4
            [&_h3]:font-display [&_h3]:font-medium [&_h3]:text-text-primary
            [&_h3]:!text-[19px] [&_h3]:!leading-[1.3] [&_h3]:!tracking-[-0.01em]
            [&_h3]:mt-10 [&_h3]:mb-3
            [&_p]:my-4 [&_p]:text-[17px] [&_p]:leading-[1.7] [&_p]:text-text-primary
            [&_a]:text-text-brand-primary [&_a]:underline [&_a]:underline-offset-[3px] hover:[&_a]:no-underline
            [&_strong]:font-medium [&_strong]:text-text-primary
            [&_em]:italic
            [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6
            [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
            [&_li]:my-1.5 [&_li]:text-[17px] [&_li]:leading-[1.7] [&_li]:text-text-primary
            [&_li_p]:my-1
            [&_code]:font-mono [&_code]:text-[14px] [&_code]:font-normal
            [&_code]:text-text-brand-primary [&_code]:bg-bg-brand-primary
            [&_code]:px-[6px] [&_code]:py-[2px] [&_code]:rounded-sm
            [&_pre]:my-6 [&_pre]:bg-bg-brand-primary [&_pre]:rounded-lg
            [&_pre]:px-5 [&_pre]:py-4 [&_pre]:overflow-x-auto [&_pre]:overflow-y-hidden
            [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.7]
            [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_pre_code]:rounded-none
            [&_blockquote]:my-8 [&_blockquote]:not-italic
            [&_blockquote]:bg-bg-secondary [&_blockquote]:border-l-2 [&_blockquote]:border-border-brand
            [&_blockquote]:rounded-r-lg [&_blockquote]:px-5 [&_blockquote]:py-4
            [&_blockquote_p]:m-0 [&_blockquote_p]:text-[16px] [&_blockquote_p]:leading-[1.65] [&_blockquote_p]:text-text-primary
            [&_hr]:my-12 [&_hr]:border-0 [&_hr]:border-t-[0.5px] [&_hr]:border-border-primary
            [&_img]:my-8 [&_img]:rounded-lg [&_img]:border-[0.5px] [&_img]:border-border-primary
          "
        >
          <EditableRichText field={body} />
        </div>
      </div>
    </section>
  )
}
