// PageRenderer — renders all sections of a page in order using SectionRenderer.
//
// This is a SERVER component by default in Next.js App Router. No "use client",
// no hooks, no state. See SectionRenderer.tsx for the client-boundary note.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - type-only imports from `domain/` are allowed.
//   - type-only imports from `sections/` are allowed.
//   - runtime import of `react` is allowed (we render JSX).
//   - NOTHING from storage/, runtime/, mcp/, tasks/, handlers/, config/.

import type { Page } from '../domain/index'
import type { AnySectionDefinition } from '../sections/index'

import { SectionRenderer } from './SectionRenderer'

export interface PageRendererProps {
  /** The page data from getContent. */
  readonly page: Page
  /** The registry of section definitions. */
  readonly definitions: readonly AnySectionDefinition[]
}

/**
 * Renders all sections of a page in order. Wraps them in a `<div>` tagged
 * with `data-agntcms-page` for debugging and testing (not for styling).
 */
export function PageRenderer(props: PageRendererProps): React.ReactElement {
  const { page, definitions } = props

  return (
    <div data-agntcms-page={page.slug}>
      {page.sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          definitions={definitions}
        />
      ))}
    </div>
  )
}
