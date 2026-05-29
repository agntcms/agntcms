'use client'

// PreviewContext — broadcasts the current preview mode to all client
// components in the page tree (EditableText, EditableImage, PreviewToolbar).
//
// IMPORT CONSTRAINTS (invariant 2):
//   - runtime import of `react` only.
//   - PreviewMode is defined locally as a string literal union identical to
//     the runtime's PreviewMode. We deliberately DO NOT import from runtime/
//     to keep server-only code out of the client bundle.

import { createContext, useContext, type ReactNode } from 'react'

import { AdminThemeBoot } from '../admin/AdminThemeBoot'
import { EnterPreviewButton } from './EnterPreviewButton'

/** Preview or published — matches the runtime concept but defined locally for the client bundle. */
export type PreviewMode = 'preview' | 'published'

export interface PreviewContextValue {
  readonly mode: PreviewMode
}

// Default to 'published' so components outside a provider behave like prod.
const PreviewContext = createContext<PreviewContextValue>({ mode: 'published' })

export interface PreviewProviderProps {
  readonly mode: PreviewMode
  readonly children: ReactNode
}

/**
 * Wraps the page tree to broadcast the current preview mode.
 *
 * Pre-v0.5 this also auto-mounted an AgentTaskProvider in preview mode.
 * The agent channel was removed in v0.5 (ARCHITECTURE.md §6, §7).
 *
 * The previous Ctrl/Cmd+\\ hotkey was replaced by a floating
 * EnterPreviewButton — mounted here because the frozen catch-all page
 * wraps every page in PreviewProvider regardless of mode, so the
 * button is naturally present on published pages where the developer
 * actually wants to enter preview. The button has its own internal
 * NODE_ENV gate (statically eliminated from production bundles) and
 * its own mode gate (only renders on published pages).
 */
export function PreviewProvider({ mode, children }: PreviewProviderProps): React.ReactElement {
  return (
    <PreviewContext.Provider value={{ mode }}>
      {/* AdminThemeBoot only mounts in preview mode — production pages must
          not ship the admin token stylesheet. */}
      {mode === 'preview' && <AdminThemeBoot />}
      {children}
      <EnterPreviewButton mode={mode} />
    </PreviewContext.Provider>
  )
}

/** Returns the current preview mode. Defaults to 'published' outside a PreviewProvider. */
export function usePreviewMode(): PreviewMode {
  return useContext(PreviewContext).mode
}
