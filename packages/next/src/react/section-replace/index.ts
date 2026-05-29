// Barrel for section-replace sub-module. Named exports only.
//
// All components here are "use client". They communicate with the server
// exclusively via fetch — no direct module imports to handler code
// (invariant 2). As of v0.5 there is no SSE/MCP dependency: section type
// swaps go through POST /api/agntcms/draft/replace-section.

export { SectionPickerModal, filterDefinitions, mergePreviewProps } from './SectionPickerModal'
export type { DefinitionLike, GlobalEntry, SectionPickerModalProps } from './SectionPickerModal'
export { SectionReplaceOverlay } from './SectionReplaceOverlay'
export type { SectionReplaceOverlayProps } from './SectionReplaceOverlay'
export { SectionWrapper } from './SectionWrapper'
export type { SectionWrapperProps } from './SectionWrapper'
