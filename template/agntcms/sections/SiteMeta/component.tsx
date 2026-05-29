'use client'

// SiteMeta is a data-only global: it holds SEO defaults (siteName,
// baseUrl, defaultOgImage, defaultDescription). It is consumed at the
// server layer by generateMetadata in app/[[...slug]]/page.tsx and by
// app/layout.tsx; it is never rendered as a visible section.
//
// The component is intentionally a no-op. GlobalSlot renders it when
// reading via runtime.getGlobal, but no visible output is wanted — the
// section exists purely to make the data editable through the admin UI.

import type { EditableSlot } from '@agntcms/next/client'
import type { ImageValue } from '@agntcms/next'

interface Props {
  readonly siteName: EditableSlot<'text', string>
  readonly baseUrl: EditableSlot<'text', string>
  readonly defaultOgImage: EditableSlot<'image', ImageValue>
  readonly defaultDescription: EditableSlot<'text', string>
}

export function SiteMetaComponent(_props: Props) {
  // Intentional no-op — this global is consumed by server metadata
  // helpers only. Rendering it in the page body would be incorrect.
  return null
}
