// Barrel for the runtime module. Exposes the factory and types that
// downstream layers (handlers, config) consume. The public subpath
// export `@agntcms/next/server` (T-020) will re-export from here.

export { createRuntime } from './getContent'
export type {
  Runtime,
  RuntimeOptions,
  GetContentInput,
  GetGlobal,
  GetGlobalInput,
} from './getContent'
export type {
  PreviewMode,
  PreviewField,
  PreviewFieldOrigin,
  FieldIn,
  PageContent,
  GetContentOptions,
  GetContent,
} from './getContent.types'

// Re-export domain schema types that downstream layers commonly need
// alongside the runtime types (avoids forcing callers to add a second
// import from domain/).
export type {
  SectionSchema,
  FieldValueFor,
  ReferenceValue,
} from './getContent.types'

// Page listing runtime (ARCHITECTURE.md §4 — Selections).
export { createListPages } from './listPages'
export type { ListPages, ListPagesInput, ListPagesSort } from './listPages'

// Sitemap helpers used by the frozen template route.
export { isSitemapEligibleSlug } from './sitemap'
export {
  NOT_FOUND_PAGE_SLUG,
  SERVER_ERROR_PAGE_SLUG,
  getReservedPageSlugViolation,
} from './systemPages'
