// Barrel for `react-server/` — RSC-ONLY zone.
//
// This module hosts React Server Components that need runtime imports
// (e.g. `<GlobalSlot>` calling `getGlobal`). Every file here MUST be a
// pure server component with no `'use client'` directive.
//
// Why the strict RSC-only rule:
//   tsup bundles this entry into `dist/server.mjs` for the
//   `@agntcms/next/server` subpath export. esbuild strips embedded
//   `'use client'` directives during bundling, so a `'use client'` file
//   placed here would be inlined into the server bundle and lose its
//   boundary. The consumer's Next.js build then fails with "createContext
//   used in a server module". `'use client'` components live in `react/`
//   (and are re-exported through `@agntcms/next/client`); server
//   components in `react-server/` reach for them across the public
//   package boundary, which is the canonical Next.js pattern.
//
// Exported only via `@agntcms/next/server`. Never re-exported from
// `/client` or the root barrel.

export { GlobalSlot } from './GlobalSlot'
export type { GlobalSlotProps } from './GlobalSlot'

// `getPreviewMode()` reads the agntcms preview cookie via `next/headers`.
// Server-only (imports `next/headers`), so it lives here and is exported
// only via `@agntcms/next/server`.
export { getPreviewMode } from './getPreviewMode'
export type { GetPreviewModeOptions } from './getPreviewMode'
