'use client'

import { EditableRichText, EditableText, EditableImage } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'

interface Props {
  readonly headline: EditableSlot<'richText', string>
  readonly body: EditableSlot<'richText', string>
  readonly nameLabel: EditableSlot<'text', string>
  readonly emailLabel: EditableSlot<'text', string>
  readonly companyLabel: EditableSlot<'text', string>
  readonly messageLabel: EditableSlot<'text', string>
  readonly submitLabel: EditableSlot<'text', string>
  readonly quote: EditableSlot<'richText', string>
  readonly quoteName: EditableSlot<'text', string>
  readonly quoteRole: EditableSlot<'text', string>
  readonly quotePhoto: EditableSlot<'image', ImageValue>
}

function Field({ label }: { label: EditableSlot<'text', string> }) {
  return (
    <div className="flex flex-col gap-1.5">
      <EditableText
        field={label}
        as="span"
        className="font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
      />
      <input
        type="text"
        className="w-full border-0 border-b border-hairline bg-transparent py-2.5 text-[15px] text-ink outline-none focus:border-b-2 focus:border-ink focus:pb-[9px]"
      />
    </div>
  )
}

export function ContactFormComponent({
  headline,
  body,
  nameLabel,
  emailLabel,
  companyLabel,
  messageLabel,
  submitLabel,
  quote,
  quoteName,
  quoteRole,
  quotePhoto,
}: Props) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1280px] px-8 py-[88px]">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="[&_h2]:m-0 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:text-[48px] [&_h2]:leading-[1.05] [&_h2]:tracking-[-0.03em] [&_p]:m-0 [&_p]:font-display [&_p]:font-semibold [&_p]:text-ink [&_p]:text-[48px] [&_p]:leading-[1.05] [&_p]:tracking-[-0.03em] [&_em]:not-italic [&_em]:text-ink-3 [&_em]:font-semibold">
              <EditableRichText field={headline} />
            </div>
            <EditableRichText
              field={body}
              className="mt-4 max-w-[540px] [&_p]:m-0 [&_p]:text-[17px] [&_p]:leading-[1.55] [&_p]:text-ink-2"
            />
            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-10 flex max-w-[540px] flex-col gap-5"
            >
              <Field label={nameLabel} />
              <Field label={emailLabel} />
              <Field label={companyLabel} />
              <div className="flex flex-col gap-1.5">
                <EditableText
                  field={messageLabel}
                  as="span"
                  className="font-mono text-[11px] font-medium tracking-[0.07em] uppercase text-ink-3"
                />
                <textarea
                  rows={4}
                  className="w-full resize-y border-0 border-b border-hairline bg-transparent py-2.5 text-[15px] text-ink outline-none focus:border-b-2 focus:border-ink focus:pb-[9px]"
                />
              </div>
              <button
                type="submit"
                className="mt-2 inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-sm border border-ink bg-ink px-[22px] py-[13px] text-[15px] font-medium text-paper transition-colors duration-200 ease-out hover:bg-ink-2 hover:border-ink-2"
              >
                <EditableText field={submitLabel} as="span" />
              </button>
            </form>
          </div>
          <aside className="self-start border border-hairline bg-transparent p-8">
            <span className="font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3">
              customer quote
            </span>
            <EditableRichText
              field={quote}
              className="mt-5 mb-6 [&_p]:m-0 [&_p]:text-[18px] [&_p]:leading-[1.5] [&_p]:tracking-[-0.01em] [&_p]:text-ink"
            />
            <div className="flex items-center gap-3 border-t border-hairline pt-5">
              <EditableImage
                field={quotePhoto}
                className="!block h-9 w-9 rounded-full object-cover grayscale [&_img]:h-9 [&_img]:w-9 [&_img]:rounded-full [&_img]:object-cover [&_img]:grayscale"
              />
              <div>
                <EditableText
                  field={quoteName}
                  as="div"
                  className="text-sm font-semibold text-ink"
                />
                <EditableText
                  field={quoteRole}
                  as="div"
                  className="font-mono text-[11px] tracking-[0.07em] uppercase text-ink-3"
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
