// Barrel for the storage module. Named exports only.
//
// `storage/` sits one step above `domain/` in the dependency graph:
//   domain ← storage ← runtime ← handlers/mcp
// It exports the interface types and the default FS implementations. User
// code in the template selects an adapter from `@agntcms/next/config` or
// wires one up directly via these factories.

export type {
  ContentStorageAdapter,
  DraftSummary,
  GlobalDraftSummary,
  GlobalHistoryEntry,
  GlobalSummary,
  HistoryEntry,
  PageMode,
  PageSummaryEntry,
  PublishedPageEntry,
} from './content'

export type {
  AssetStorageAdapter,
  AssetUploadInput,
  AssetUploadResult,
  AssetListEntry,
} from './assets'

export { createFsContentAdapter } from './fs/content'
export type { FsContentAdapterOptions } from './fs/content'

export { createFsAssetAdapter } from './fs/assets'
export type { FsAssetAdapterOptions } from './fs/assets'
