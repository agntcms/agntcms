'use client'

import { useState } from 'react'
import { EditableLink, EditableRichText, read } from '@agntcms/next/client'
import type { EditableSlot } from '@agntcms/next/client'
import { hrefOf, isExternalLink } from '@agntcms/next'
import type { LinkValue } from '@agntcms/next'

interface Props {
  readonly eyebrow: EditableSlot<'richText', string>
  readonly headline: EditableSlot<'richText', string>
  readonly intro: EditableSlot<'richText', string>
  readonly command: EditableSlot<'richText', string>
  readonly meta: EditableSlot<'richText', string>
  readonly primaryCta: EditableSlot<'link', LinkValue>
  readonly secondaryCta: EditableSlot<'link', LinkValue>
}

export function GettingStartedComponent({ eyebrow, headline, intro, command, meta, primaryCta: rawPrimary, secondaryCta: rawSecondary }: Props) {
  const primaryCta = read(rawPrimary)
  const secondaryCta = read(rawSecondary)
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(read(command))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }
  return (
    <section id="start" className="bg-bg-primary">
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
          field={intro}
          className="prose max-w-[60ch] mb-7 [&_p]:text-text-primary [&_p]:m-0"
        />

        <div className="relative bg-bg-brand-primary border-[0.5px] border-border-primary rounded-xl px-7 py-6 mb-5">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy command"
            className="absolute top-3 right-3 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] uppercase text-text-secondary hover:text-text-primary bg-transparent border-[0.5px] border-border-primary rounded-sm px-2 py-1 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>copied</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>copy</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-3 flex-wrap pr-20">
            <span className="font-mono text-text-brand-primary text-[16px] opacity-60">$</span>
            <EditableRichText
              field={command}
              as="code"
              className="font-mono text-[16px] text-text-brand-primary bg-transparent p-0 flex-1 min-w-0 break-all"
            />
          </div>
          <EditableRichText
            field={meta}
            className="prose mt-4 [&_p]:text-[13px] [&_p]:text-text-secondary [&_p]:font-mono [&_p]:m-0"
          />
        </div>

        <div className="flex gap-2.5 flex-wrap">
          {hrefOf(primaryCta) && (
            <a
              href={hrefOf(primaryCta)}
              target={isExternalLink(primaryCta) ? '_blank' : undefined}
              rel={isExternalLink(primaryCta) ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-2 bg-transparent text-text-primary border-[0.5px] border-border-primary rounded-sm text-[13px] font-medium px-4 py-2 no-underline hover:bg-bg-secondary transition-colors"
            >
              <EditableLink field={rawPrimary} className="no-underline" />
              <span aria-hidden="true">→</span>
            </a>
          )}
          {hrefOf(secondaryCta) && (
            <a
              href={hrefOf(secondaryCta)}
              target={isExternalLink(secondaryCta) ? '_blank' : undefined}
              rel={isExternalLink(secondaryCta) ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-2 bg-transparent text-text-primary border-[0.5px] border-border-primary rounded-sm text-[13px] font-medium px-4 py-2 no-underline hover:bg-bg-secondary transition-colors"
            >
              <EditableLink field={rawSecondary} className="no-underline" />
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
