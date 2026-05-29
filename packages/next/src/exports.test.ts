// Smoke tests for public subpath barrels.
//
// These tests verify that every subpath barrel re-exports the expected
// named symbols, and that the client barrel does not import from server-only
// modules. The tests import from the SOURCE barrels (not dist/) so they
// run without a build step.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Helper: collect named exports from a barrel module
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
async function getExportNames(barrelPath: string): Promise<string[]> {
  // Dynamic import returns { [name]: value, default?: ... }
  const mod = (await import(barrelPath)) as Record<string, unknown>
  return Object.keys(mod).sort()
}

// ---------------------------------------------------------------------------
// Root barrel: @agntcms/next
// ---------------------------------------------------------------------------

describe('@agntcms/next (root barrel)', () => {
  it('exports the expected domain types and section factories', async () => {
    const names = await getExportNames('./index')
    // Field type constructors (Field-suffixed names — symmetric with the
    // interface types and free of JS-global / DOM-global shadowing).
    expect(names).toContain('TextField')
    expect(names).toContain('RichTextField')
    expect(names).toContain('ImageField')
    expect(names).toContain('VideoField')
    expect(names).toContain('ReferenceField')
    expect(names).toContain('LinkField')
    expect(names).toContain('ButtonField')
    expect(names).toContain('NumberField')
    expect(names).toContain('BooleanField')
    expect(names).toContain('SelectField')
    expect(names).toContain('ListField')
    // Negative guard: the bare-noun shapes used to shadow JS globals
    // (`Number`, `Boolean`) and the DOM `Image` constructor. They were
    // renamed pre-1.0; ensure none of them leak back.
    expect(names).not.toContain('Text')
    expect(names).not.toContain('Number')
    expect(names).not.toContain('Boolean')
    expect(names).not.toContain('Image')
    // Same negative guard for video — bare `Video` would shadow the
    // global HTMLVideoElement constructor in some contexts.
    expect(names).not.toContain('Video')
    // Same negative guard for button — bare `Button` would shadow the
    // ARIA "button" role / common UI library identifiers in author
    // code. The Field-suffixed name is the canonical identifier.
    expect(names).not.toContain('Button')
    // Section factory
    expect(names).toContain('defineSection')
    // Domain utility
    expect(names).toContain('hasUniqueSectionIds')
  })

  it('does NOT export handler factories', async () => {
    // The root barrel is intentionally type/factory-only. Handler factories
    // live behind `/handlers`. Guarding `createPreviewHandler` and
    // `createDraftHandler` is enough to catch a drive-by re-export of the
    // handler barrel into the root — the removed-in-v0.5 names
    // (createMcpHandler, createEventsHandler) no longer exist anywhere in
    // the package, so guarding them here is tautological.
    const names = await getExportNames('./index')
    expect(names).not.toContain('createPreviewHandler')
    expect(names).not.toContain('createDraftHandler')
  })
})

// ---------------------------------------------------------------------------
// Server barrel: @agntcms/next/server
// ---------------------------------------------------------------------------

describe('@agntcms/next/server barrel', () => {
  it('exports runtime factory', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('createRuntime')
    // Negative guard: the runtime no longer commits to git (ARCHITECTURE.md
    // §4 — publish/git split). Users commit `content/` manually; Vercel
    // autodeploys. Any reintroduction of these symbols on `/server` must be
    // a deliberate architecture revert, not a drive-by.
    expect(names).not.toContain('gitCommitContent')
    expect(names).not.toContain('GitNothingToCommitError')
  })

  it('exports domain field type constructors', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('TextField')
    expect(names).toContain('RichTextField')
    expect(names).toContain('ImageField')
    expect(names).toContain('VideoField')
    expect(names).toContain('ReferenceField')
    expect(names).toContain('ButtonField')
    expect(names).toContain('ListField')
    expect(names).toContain('SelectField')
  })

  it('exports storage adapter factories', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('createFsContentAdapter')
    expect(names).toContain('createFsAssetAdapter')
  })

  it('exports section definition factory', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('defineSection')
  })

  it('exports domain invariant helper', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('hasUniqueSectionIds')
  })

  it('exports GlobalSlot (server-only RSC)', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('GlobalSlot')
  })

  it("does NOT export GlobalSaveProvider — it's a 'use client' component on /client", async () => {
    // Bundling a `'use client'` component into `dist/server.mjs` strips
    // its directive (esbuild behavior). `GlobalSaveProvider` lives on
    // `/client`; `<GlobalSlot>` references it across the package
    // boundary. See `react/editable/GlobalSaveProvider.tsx`.
    const names = await getExportNames('./server')
    expect(names).not.toContain('GlobalSaveProvider')
  })

  it('exports default adapter factories (moved from /config to keep /config client-safe)', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('createDefaultContentAdapter')
    expect(names).toContain('createDefaultAssetAdapter')
  })

  it('exports listPages runtime (ARCHITECTURE.md §4)', async () => {
    const names = await getExportNames('./server')
    expect(names).toContain('createListPages')
  })
})

// ---------------------------------------------------------------------------
// Client barrel: @agntcms/next/client
// ---------------------------------------------------------------------------

describe('@agntcms/next/client barrel', () => {
  it('exports renderer components', async () => {
    const names = await getExportNames('./client')
    expect(names).toContain('PageRenderer')
    expect(names).toContain('SectionRenderer')
  })

  it('exports preview utilities', async () => {
    const names = await getExportNames('./client')
    expect(names).toContain('PreviewProvider')
    expect(names).toContain('usePreviewMode')
    expect(names).toContain('PreviewToolbar')
  })

  it('exports editable field components', async () => {
    const names = await getExportNames('./client')
    expect(names).toContain('EditableText')
    expect(names).toContain('EditableImage')
    expect(names).toContain('EditableVideo')
    expect(names).toContain('VideoPickerModal')
    expect(names).toContain('EditableButton')
    expect(names).toContain('ButtonPickerModal')
    expect(names).toContain('isPreviewField')
    expect(names).toContain('read')
    expect(names).toContain('isSlotInPreview')
    expect(names).toContain('SaveProvider')
    expect(names).toContain('useSaveField')
  })

  it("exports GlobalSaveProvider (the client-side save provider used by <GlobalSlot>)", async () => {
    const names = await getExportNames('./client')
    expect(names).toContain('GlobalSaveProvider')
  })

  it('exports section replace utilities', async () => {
    const names = await getExportNames('./client')
    expect(names).toContain('SectionPickerModal')
    expect(names).toContain('SectionReplaceOverlay')
    expect(names).toContain('SectionWrapper')
    // Negative guard: `useTaskEvents` was the SSE-driven hook backing the
    // old MCP section-replace pipeline. In v0.5 the replace flow POSTs
    // directly to /api/agntcms/draft/replace-section and the hook is
    // gone. A regression that reintroduces it must be a deliberate
    // breaking-change revert, not a drive-by re-export.
    expect(names).not.toContain('useTaskEvents')
  })

})

// ---------------------------------------------------------------------------
// Client barrel: import safety (invariant 2)
// ---------------------------------------------------------------------------

describe('@agntcms/next/client import safety', () => {
  it('source file only imports from ./react/', () => {
    // Read the source barrel and verify it only imports from ./react/
    const clientSource = fs.readFileSync(
      path.resolve(__dirname, 'client.ts'),
      'utf-8',
    )

    // Extract all `from '...'` import specifiers
    const importSpecifiers = Array.from(
      clientSource.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ).map((m) => m[1]!)

    for (const specifier of importSpecifiers) {
      // Every import must point at ./react/ (the react module barrel)
      expect(specifier).toMatch(
        /^\.\/react\//,
      )
    }

    // Negative check: must not contain any of these module references
    const forbidden = [
      './storage/',
      './runtime/',
      './mcp/',
      './tasks/',
      './handlers/',
      './config/',
      './domain/',
      './sections/',
    ]
    for (const pattern of forbidden) {
      expect(clientSource).not.toContain(pattern)
    }
  })
})

// ---------------------------------------------------------------------------
// Handlers barrel: @agntcms/next/handlers
// ---------------------------------------------------------------------------

describe('@agntcms/next/handlers barrel', () => {
  it('exports all handler factories', async () => {
    const names = await getExportNames('./handlers')
    expect(names).toContain('createPreviewHandler')
    expect(names).toContain('createDraftHandler')
    expect(names).toContain('createAssetsHandler')
    // Negative guards — the agent channel / SSE event handlers were
    // removed in v0.5 (ARCHITECTURE.md sections 6, 7, 9). A regression
    // that reintroduces them must be a deliberate breaking-change
    // revert, not a drive-by re-export.
    expect(names).not.toContain('createMcpHandler')
    expect(names).not.toContain('createEventsHandler')
  })

  it('exports page / global / preview-token handler factories', async () => {
    const names = await getExportNames('./handlers')
    expect(names).toContain('createPageHandler')
    expect(names).toContain('createGlobalHandler')
    expect(names).toContain('createPreviewTokenStore')
  })

  it('exports the catch-all route dispatcher factory', async () => {
    // The dispatcher is the single Next.js wiring point the template
    // consumes in its frozen catch-all route. It survived the v0.5
    // channel removal; the test pins it here so accidental deletion of
    // the re-export shows up in the smoke suite.
    const names = await getExportNames('./handlers')
    expect(names).toContain('createagntcmsRouteHandler')
  })

  // Removed-in-v0.5 negative guards: the agent bridge factory and the
  // in-memory task store factory disappeared from `/handlers` when the
  // channel was dropped. Tests assert they stay gone.
  it('does NOT export the removed-in-v0.5 agent bridge / task store factories', async () => {
    const names = await getExportNames('./handlers')
    expect(names).not.toContain('createAgentBridge')
    expect(names).not.toContain('AgentUnreachableError')
    expect(names).not.toContain('createTaskStore')
  })
})

// ---------------------------------------------------------------------------
// Config barrel: @agntcms/next/config
// ---------------------------------------------------------------------------

describe('@agntcms/next/config barrel', () => {
  it('exports config utilities', async () => {
    const names = await getExportNames('./_config')
    expect(names).toContain('defineConfig')
    expect(names).toContain('withagntcms')
  })

  it('does NOT export FS-backed adapter factories (client-safety: would drag node:fs into client bundles)', async () => {
    // The `/config` subpath is reachable from `'use client'` section
    // components via field-type imports. Re-exporting `createDefault*Adapter`
    // from here would statically pull `node:fs`, `node:path`, `node:crypto`
    // into the client bundle and break `next build`. The factories live on
    // `/server` instead.
    const names = await getExportNames('./_config')
    expect(names).not.toContain('createDefaultContentAdapter')
    expect(names).not.toContain('createDefaultAssetAdapter')
  })

  it('exports field-type constructors for authoring', async () => {
    // `agntcms/sections/*` imports field descriptors alongside
    // `defineConfig` from `/config`.
    const names = await getExportNames('./_config')
    expect(names).toContain('TextField')
    expect(names).toContain('RichTextField')
    expect(names).toContain('ImageField')
    expect(names).toContain('VideoField')
    expect(names).toContain('ReferenceField')
    expect(names).toContain('LinkField')
    expect(names).toContain('ButtonField')
    expect(names).toContain('NumberField')
    expect(names).toContain('BooleanField')
    expect(names).toContain('ListField')
    expect(names).toContain('SelectField')
  })
})
