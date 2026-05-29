'use client'

import { EditableRichText } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly body: EditableSlot<'richText', string>
  readonly messageEyebrow: EditableSlot<'richText', string>
  readonly message: EditableSlot<'richText', string>
}

export function ProblemComponent({ eyebrow, headline, body, messageEyebrow, message }: Props) {
  return (
    <section id="problem" className="bg-bg-primary">
      <div className="mx-auto max-w-[1080px] px-8 py-16 border-t-[0.5px] border-border-secondary">
        <EditableRichText
          field={eyebrow}
          className="prose mb-3.5 [&_p]:text-[11px] [&_p]:font-medium [&_p]:tracking-[0.10em] [&_p]:uppercase [&_p]:text-text-brand-primary [&_p]:m-0"
        />
        <EditableRichText
          field={headline}
          className="mb-6
            [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-text-primary [&_h2]:m-0
            [&_h2]:max-w-[22ch]
            [&_h2]:!text-[clamp(28px,3.6vw,40px)] [&_h2]:!leading-[1.1] [&_h2]:!tracking-[-0.02em]"
        />
        <EditableRichText
          field={body}
          className="prose max-w-[60ch]
            [&_p]:text-text-primary [&_p]:m-0 [&_p]:mb-4 [&_p:last-child]:mb-0"
        />
        <div className="bg-bg-secondary border-[0.5px] border-border-primary border-l-2 border-l-border-brand rounded-r-lg py-[18px] px-[22px] my-6 max-w-[60ch]">
          <EditableRichText
            field={messageEyebrow}
            className="prose mb-2 [&_p]:text-[11px] [&_p]:font-medium [&_p]:tracking-[0.10em] [&_p]:uppercase [&_p]:text-text-brand-primary [&_p]:m-0"
          />
          <EditableRichText
            field={message}
            className="prose
              [&_p]:font-display [&_p]:font-medium [&_p]:text-[22px] [&_p]:leading-[1.35]
              [&_p]:tracking-[-0.02em] [&_p]:text-text-primary [&_p]:m-0"
          />
        </div>
      </div>
    </section>
  )
}
