// FROZEN — do not edit. Framework file managed by agntcms.
//
// Single catch-all dispatcher for every admin endpoint under
// /api/agntcms/*. All admin endpoints are dev-only: this file carries the
// .dev.ts suffix so withagntcms() excludes it from production builds via
// the pageExtensions hook.
//
// Before v0.3 the template carried ~30 thin proxy files, one per endpoint.
// A new endpoint in the framework required users to copy the new file into
// their frozen zone. With this catch-all the routing table lives inside
// @agntcms/next/handlers (dispatcher.ts) and new endpoints flow to users
// through a regular `pnpm up @agntcms/next`. See ARCHITECTURE.md §3.

import { createagntcmsRouteHandler } from '@agntcms/next/handlers'
import { deriveHandlerDeps } from '@agntcms/next/config'
import config from '@/agntcms/config'
import {
  contentAdapter,
  assetAdapter,
  runtime,
  previewTokenStore,
} from '../_shared'

// `deriveHandlerDeps` derives all three handler dependencies — allowed types,
// per-type field defaults, and the set of system (framework-managed) types —
// from `config.sections` in lockstep. Hoisted to module scope so we don't
// rebuild them on every request. See ARCHITECTURE.md §3 "Section registration"
// for the system-global concept.
const { allowedTypes, sectionDefaults, systemTypes } = deriveHandlerDeps(config)

export const { GET, POST, PUT, DELETE } = createagntcmsRouteHandler({
  assets: { assetAdapter },
  draft: { contentAdapter, runtime, sectionDefaults },
  page: { contentAdapter, runtime },
  global: { contentAdapter, allowedTypes, sectionDefaults, systemTypes },
  globalDraft: { contentAdapter, allowedTypes, sectionDefaults, systemTypes },
  preview: { tokenStore: previewTokenStore },
})
