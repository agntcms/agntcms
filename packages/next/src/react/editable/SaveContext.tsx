'use client'

// SaveContext — provides a `saveField` function to all editable components
// within a subtree, so that EditableText/EditableImage can persist changes
// without the section component explicitly wiring onSave.
//
// The context lives in `editable/` (not `preview/`) to avoid circular
// dependencies: editable components consume it, and a preview-level
// provider supplies it.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, local editable/ files.

import { createContext, useContext } from 'react'
import type { PreviewFieldOriginLike } from './isPreviewField'

/**
 * Function signature for field-level save. Accepts the origin metadata
 * (which section + field) and the new field value.
 *
 * `newValue` is `unknown` because the save callback stores the value
 * verbatim into `section.data[fieldPath]`, and each editable component
 * is responsible for producing the right value shape before calling
 * save. In v1 every built-in field resolves to a string, but keeping
 * the channel lossless avoids a breaking change if a future BUILT-IN
 * field type introduces a non-string value.
 */
export type SaveFieldFn = (origin: PreviewFieldOriginLike, newValue: unknown) => void

const SaveContext = createContext<SaveFieldFn | null>(null)

export interface SaveProviderProps {
  readonly saveField: SaveFieldFn
  readonly children: React.ReactNode
}

/**
 * Provides a `saveField` callback to all EditableText/EditableImage
 * descendants. Typically placed by SectionEditControls around the
 * preview section list.
 */
export function SaveProvider(props: SaveProviderProps): React.ReactElement {
  const { saveField, children } = props
  return <SaveContext.Provider value={saveField}>{children}</SaveContext.Provider>
}

/**
 * Returns the `saveField` function from the nearest SaveProvider, or
 * `null` if no provider is present (e.g., published mode).
 */
export function useSaveField(): SaveFieldFn | null {
  return useContext(SaveContext)
}
