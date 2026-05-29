'use client'

import { EditableRichText, EditableText, read } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'

interface Props {
  readonly headline: EditableSlot<'richText', string>
  readonly emailPlaceholder: EditableSlot<'text', string>
  readonly buttonLabel: EditableSlot<'text', string>
  readonly helperText: EditableSlot<'richText', string>
}

export function NewsletterComponent({
  headline,
  emailPlaceholder,
  buttonLabel,
  helperText,
}: Props) {
  return (
    <section className="bg-paper-2">
      <div className="mx-auto w-full max-w-[720px] px-8 py-20 text-center">
        <div className="[&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[36px] [&_h2]:leading-[1.1] [&_h2]:tracking-[-0.025em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[36px] [&_p]:leading-[1.1] [&_p]:tracking-[-0.025em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
          <EditableRichText field={headline} />
        </div>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-7 flex max-w-[480px] items-end gap-0 border-b border-ink-2"
        >
          <input
            type="email"
            placeholder={read(emailPlaceholder) || 'you@company.com'}
            className="flex-1 bg-transparent px-0 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-4"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-sm border border-ink bg-ink px-[18px] py-2.5 text-sm font-medium text-paper transition-colors duration-200 ease-out hover:bg-ink-2 hover:border-ink-2"
          >
            <EditableText field={buttonLabel} as="span" />
          </button>
        </form>
        <EditableRichText
          field={helperText}
          className="mt-3.5 [&_p]:font-mono [&_p]:text-[12px] [&_p]:tracking-[0.07em] [&_p]:uppercase [&_p]:text-ink-3 [&_p]:m-0"
        />
      </div>
    </section>
  )
}
