// Subpath barrel: `@agntcms/next/server`
//
// Aggregates the server-side public API: runtime factory, storage adapter
// interfaces and FS implementations, git helper, and the domain/section
// types that server consumers commonly need.
//
// This barrel is imported from server components, route handlers, and
// `next.config.ts`. It MUST NOT be imported in client components.

// Register FS-backed default adapter factories on the `globalThis` slot
// so `defineConfig` (in the client-reachable `/config` subpath) can fill
// defaults without statically importing `node:fs`, `node:path`, or
// `node:crypto` itself. We call an exported function rather than rely on
// a bare side-effect import because tsup's `sideEffects: false` allows
// esbuild to drop bare imports from non-entry modules. ESM evaluation
// order guarantees this call runs before any `agntcms/config.ts` in
// user space (the template's frozen `_shared.ts` and page entries import
// `@agntcms/next/server` BEFORE the user config). See
// `config/defaults-registry.ts` for the full rationale.
import { installDefaultAdapterFactories } from './config/defaults'
installDefaultAdapterFactories()

// -- runtime --
export { createRuntime } from './runtime/index'
export type {
  Runtime,
  RuntimeOptions,
  GetContentInput,
  GetGlobal,
  GetGlobalInput,
  PreviewMode,
  PreviewField,
  PreviewFieldOrigin,
  FieldIn,
  PageContent,
  GetContentOptions,
  GetContent,
} from './runtime/index'

// Page listing runtime (ARCHITECTURE.md §4). Exposed on `/server` so
// server components and route handlers can build blog-index-style queries.
export {
  createListPages,
  isSitemapEligibleSlug,
  NOT_FOUND_PAGE_SLUG,
  SERVER_ERROR_PAGE_SLUG,
  getReservedPageSlugViolation,
} from './runtime/index'
export type { ListPages, ListPagesInput, ListPagesSort } from './runtime/index'

// -- storage adapter interfaces --
export type {
  ContentStorageAdapter,
  DraftSummary,
  GlobalDraftSummary,
  GlobalSummary,
  HistoryEntry,
  PageMode,
  PageSummaryEntry,
  PublishedPageEntry,
} from './storage/index'

export type {
  AssetStorageAdapter,
  AssetUploadInput,
  AssetUploadResult,
} from './storage/index'

// -- FS adapter factories --
export { createFsContentAdapter } from './storage/index'
export type { FsContentAdapterOptions } from './storage/index'

export { createFsAssetAdapter } from './storage/index'
export type { FsAssetAdapterOptions } from './storage/index'

// Default adapter factories with canonical template paths
// (ARCHITECTURE.md §3). Server-only because they statically import
// `node:fs/promises`, `node:path`, `node:crypto`. Used to live on
// `/config` but moved here when `/config` was made client-safe; their
// only out-of-package consumer was `defineConfig`'s internal defaulting,
// which now goes through a `globalThis` registry populated by the
// side-effect `import './config/defaults'` at the top of this file.
export {
  createDefaultContentAdapter,
  createDefaultAssetAdapter,
} from './config/defaults'
export type { DefaultAdapterOptions } from './config/defaults'

// -- domain types commonly needed alongside runtime --
export type { Global } from './domain/index'
export type { Page, PageSeo, PageSummary } from './domain/index'
export type { Section } from './domain/index'
export type {
  ButtonValue,
  FieldDescriptor,
  FieldKind,
  ImageValue,
  LinkValue,
  SelectOption,
  VideoValue,
} from './domain/index'
// Each `TextField`/`ImageField`/… name has BOTH a type meaning (the
// interface) and a value meaning (the singleton or factory). A single
// non-type re-export carries both namespaces.
export {
  TextField,
  RichTextField,
  ImageField,
  VideoField,
  ReferenceField,
  LinkField,
  ButtonField,
  NumberField,
  BooleanField,
  SelectField,
  ListField,
} from './domain/index'
export type {
  SectionSchema,
  ReferenceValue,
  FieldValueFor,
  ListItem,
} from './domain/index'
export { hasUniqueSectionIds } from './domain/index'
export {
  hrefOf,
  isExternalLink,
  linkAnchorAttrs,
  normalizeLinkValue,
  validateInternalSlug,
  validateExternalUrl,
  validateEmail,
  validatePhone,
} from './domain/index'

// -- server-only React components (require runtime imports) --
//
// `<GlobalSlot>` is a React Server Component that renders a named
// global anywhere in the layout tree. Lives in `react-server/`
// (separate from `react/`) so it can call `getGlobal()` at runtime
// without violating invariant 1. Exported only here in `/server`.
//
// NOTE: `GlobalSaveProvider` USED to be re-exported here. It was moved
// to `@agntcms/next/client` because it is a `'use client'` component
// and bundling it into `dist/server.mjs` strips its directive (see the
// header of `react/editable/GlobalSaveProvider.tsx`). Consumers that
// referenced it from `/server` must update to import from `/client`.
// This is a deliberate breaking change in the same uncommitted batch
// that introduced the export.
export { GlobalSlot } from './react-server/index'
export type { GlobalSlotProps } from './react-server/index'

// `getPreviewMode()` resolves the request's preview `mode` from the
// agntcms preview cookie (`__agntcms_preview`). Use it in `layout.tsx`
// and `[[...slug]]/page.tsx` so page content and layout globals derive
// the SAME mode. Server-only — reads `next/headers`.
export { getPreviewMode } from './react-server/index'
export type { GetPreviewModeOptions } from './react-server/index'

// -- section definition types --
export { defineSection } from './sections/index'
export type {
  SectionComponent,
  SectionDefinition,
  AnySectionDefinition,
  DefineSectionInput,
  DataOf,
  FieldDataType,
} from './sections/index'
