// Barrel for the `react/` module. Named exports only (repo code style).
//
// IMPORT CONSTRAINTS (invariant 2):
//   - `react/` depends only on `domain/` and type-only imports from `sections/`.
//   - NOTHING from storage/, mcp/, tasks/, handlers/, config/.
//   - runtime/ type-only imports are allowed in principle but not used here.
//   - section-replace/ sub-module uses only `react` and local files.

export { PageRenderer } from './PageRenderer'
export type { PageRendererProps } from './PageRenderer'
export { SectionRenderer } from './SectionRenderer'
export type { SectionRendererProps } from './SectionRenderer'

export { PreviewProvider, usePreviewMode } from './preview/index'
export type { PreviewContextValue, PreviewProviderProps, PreviewMode } from './preview/index'
export { PreviewToolbar } from './preview/index'
export type { PreviewToolbarProps } from './preview/index'
export { SectionEditControls } from './preview/index'
export type { SectionEditControlsProps } from './preview/index'

export { SectionPickerModal } from './section-replace/index'
export type { DefinitionLike, GlobalEntry, SectionPickerModalProps } from './section-replace/index'
export { SectionReplaceOverlay } from './section-replace/index'
export type { SectionReplaceOverlayProps } from './section-replace/index'
export { SectionWrapper } from './section-replace/index'
export type { SectionWrapperProps } from './section-replace/index'

export { AdminModal } from './admin/index'
export type { AdminModalProps } from './admin/index'

// Editable field components (T-016) — "use client" components for
// inline editing in preview mode.
export { EditableText } from './editable/index'
export type { EditableTextProps } from './editable/index'
export { EditableRichText } from './editable/index'
export type { EditableRichTextProps } from './editable/index'
export { EditableImage } from './editable/index'
export type { EditableImageProps } from './editable/index'
export { EditableVideo } from './editable/index'
export type { EditableVideoProps } from './editable/index'
export { VideoPickerModal } from './editable/index'
export type { VideoPickerModalProps } from './editable/index'
export { EditableLink } from './editable/index'
export type { EditableLinkProps } from './editable/index'
export { EditableButton } from './editable/index'
export type { EditableButtonProps } from './editable/index'
export { ButtonPickerModal } from './editable/index'
export type { ButtonPickerModalProps } from './editable/index'
export { EditableNumber } from './editable/index'
export type { EditableNumberProps } from './editable/index'
export { EditableBoolean } from './editable/index'
export type { EditableBooleanProps } from './editable/index'
export { EditableSelect } from './editable/index'
export type { EditableSelectProps } from './editable/index'
export { EditableList } from './editable/index'
export type { EditableListProps } from './editable/index'
export { isPreviewField } from './editable/index'
export type { PreviewFieldLike, PreviewFieldOriginLike } from './editable/index'
// `read(slot)` — collapses `EditableSlot<K, V>` to its bare `V` for
// section-author use. Sub-task 1 of the type-level editability rollout
// (EDITABILITY_DESIGN.md).
export { read } from './editable/index'
// `isSlotInPreview(slot)` — preview-mode signal for optional-field UX
// (regression fix after the sub-task 4 template migration).
export { isSlotInPreview } from './editable/index'
// `EditableSlot` / `SlotItem` are TYPES declared in `sections/`. They
// surface here so `client.ts` can re-export them under
// `@agntcms/next/client` without violating its "imports only from
// ./react/" boundary (see `exports.test.ts`'s client-import-safety
// test). The runtime constructor `wrapAsSlot` is NOT exposed here —
// that's a server-side concern wired into SectionRenderer in sub-task
// 2 and stays inside `sections/`.
export type { EditableSlot, SlotItem } from '../sections/index'
export { SaveProvider, useSaveField } from './editable/index'
export type { SaveFieldFn, SaveProviderProps } from './editable/index'
// `GlobalSaveProvider` is a `'use client'` provider used by the server
// component `<GlobalSlot>` (in `react-server/`) across the public
// package boundary `@agntcms/next/client`. It must live here, not in
// `react-server/`, so the consumer's bundler preserves its directive.
export { GlobalSaveProvider } from './editable/index'
export type { GlobalSaveProviderProps } from './editable/index'

// Agent-action surfaces — "use client" components that dispatch free-form
// edit tasks to the local Claude Code agent via the generic MCP task
// pipeline. Kept INTERNAL for v1 (not re-exported from `client.ts`).
// AgentTaskProvider is auto-mounted by PreviewProvider in preview mode.
