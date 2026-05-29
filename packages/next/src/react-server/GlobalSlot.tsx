// `<GlobalSlot>` — server component for rendering a named global anywhere
// in the React tree (typically `app/layout.tsx` for headers/footers).
//
// Why this lives in `react-server/` (not `react/`):
//   - `react/` is a strict client-leaning module: invariant 1 forbids it
//     from importing runtime/storage at runtime (only type imports).
//   - `<GlobalSlot>` is a React Server Component: it must call
//     `getGlobal()` directly, which is a runtime import.
//   - So this lives in a dedicated server-react module, exported only
//     via `@agntcms/next/server`. The client-bundle never sees it.
//
// What it does:
//   1. Calls the injected `getGlobal({ name, mode })` to fetch the global.
//   2. Looks up its `type` in the registered section definitions.
//   3. Renders the matched component with the global's `data` as props
//      (in 'preview' mode, that data is wrapped with `kind: 'global'`
//      origin metadata, so editable widgets save to the global endpoint).
//   4. When the global is missing, renders `fallback` (or `null`).
//
// Editing affordances:
//   In `'preview'` mode, the wrapped fields naturally render with their
//   existing hover/click affordances (EditableText/EditableImage/etc.).
//   The widgets see the `kind: 'global'` origin and route saves through
//   the GlobalSaveProvider that wraps the slot's render output.
//
// Why dependency injection of `getGlobal` and `definitions`:
//   `react-server/` depends on `domain/` and types from `runtime/`. The
//   runtime instance is created in user code (next.config or a server
//   helper) and threaded through. Keeping this component free of
//   runtime construction keeps it testable and avoids hidden globals.
//
// Note on the `GlobalSaveProvider` import below:
//   The provider lives in `react/editable/` and is imported across the
//   public package boundary (`@agntcms/next/client`). See the inline
//   comment at the import site for the bundling rationale.

import type { Global } from '../domain/index'
import type { AnySectionDefinition } from '../sections/index'
import { wrapSectionProps } from '../sections/index'
import type { GetGlobal } from '../runtime/getGlobal'
import type { PreviewMode } from '../runtime/getContent.types'

import type { ComponentType, ReactNode } from 'react'

// Structural brand check — mirrors the inline check in
// `SectionRenderer.tsx`. Kept as a module-scope helper (not imported
// from `react/editable/isPreviewField.ts`) to preserve `react-server/`'s
// import constraints: this server module must not depend on the
// editable subtree.
const isPreviewBrand = (
  v: unknown,
): v is { readonly __agntcmsPreview: true; readonly value: unknown } =>
  v !== null && typeof v === 'object' && '__agntcmsPreview' in v

// `GlobalSaveProvider` is a `'use client'` provider. We import it
// across the public package boundary (`@agntcms/next/client`) rather
// than via a relative path. Why: a relative import would inline the
// provider into `dist/server.mjs`, where esbuild strips its
// `'use client'` directive — the consumer build then sees `createContext`
// in a server module and refuses to compile. The cross-package import
// keeps it as a real import in the bundle, the consumer resolves it to
// `dist/client.mjs` (whose entry HAS `'use client'` at the top), and
// Next.js correctly treats it as a server-to-client boundary crossing.
//
// At source-test time, the `@agntcms/next/client` specifier is
// resolved to `./src/client.ts` via tsconfig `paths` and a matching
// vitest alias. tsup is configured to keep this specifier external in
// the build output, so it survives bundling.
import { GlobalSaveProvider } from '@agntcms/next/client'

export interface GlobalSlotProps {
  /** The global's name as registered in `content/globals/<name>.json`. */
  readonly name: string
  /** The runtime's `getGlobal` (from `createRuntime`). */
  readonly getGlobal: GetGlobal
  /** Section definitions registry. Same shape as `<PageRenderer>` consumes. */
  readonly definitions: readonly AnySectionDefinition[]
  /**
   * Read mode — same `'preview' | 'published'` as `getContent`. The
   * caller passes the same value it would pass to `getContent`,
   * obtained from `getPreviewMode()` (which reads the agntcms
   * `__agntcms_preview` cookie). Do NOT derive this from Next's native
   * `draftMode()`: nothing in the framework enables draft mode, so it
   * would always resolve to `'published'` and globals would never enter
   * the editing path.
   */
  readonly mode: PreviewMode
  /** Rendered when the global doesn't exist or has no matching definition. */
  readonly fallback?: ReactNode
}

/**
 * Renders a named global by looking up its `type` in the section
 * definitions registry. When `mode === 'preview'`, wraps the render
 * output with a `GlobalSaveProvider` so descendant editable widgets
 * dispatch saves to `/api/agntcms/global/save`.
 */
export async function GlobalSlot(
  props: GlobalSlotProps,
): Promise<React.ReactElement | null> {
  const { name, getGlobal, definitions, mode, fallback } = props

  // Adapter I/O / corrupt-JSON / runtime mishaps inside `getGlobal` must
  // not crash the entire RSC tree — a header or footer slot taking the
  // page down with it would be a worse failure mode than rendering the
  // missing-global fallback. We deliberately swallow the error here;
  // observability lives at the adapter layer (which logs the underlying
  // exception with file paths and stack), so silencing the propagation
  // here only suppresses the duplicate render-side noise.
  const global = await getGlobal({ name, mode }).catch(() => null)

  if (global === null) {
    return renderFallback(fallback)
  }

  const definition = definitions.find((d) => d.name === global.type)
  if (!definition) {
    return renderFallback(fallback)
  }

  // Same cast pattern as `<SectionRenderer>` (see SectionRenderer.tsx for
  // the full rationale): `AnySectionDefinition.component` is erased to
  // `(props: never) => unknown` for contravariant array compatibility,
  // but at runtime it is a real React component.
  const Component = definition.component as ComponentType<Record<string, unknown>>

  // Merge schema-derived defaults UNDER `global.data` BEFORE the slot
  // lift — same canonical pattern as `<SectionRenderer>`. Without this,
  // schema fields absent from `global.data` (newly added to the schema,
  // never saved) reach `wrapSectionProps`'s `Object.entries(data)` walk
  // missing entirely, the slot helper emits no entry for them, and the
  // section component receives `undefined` for the prop. Editable
  // widgets then crash on `slot.value` because v0.2's
  // `EditableSlot<K, V>` prop type does not tolerate `undefined` the
  // way the v0.1 raw-prop type did.
  //
  // Preview-mode handling mirrors `<SectionRenderer>`: when any value
  // in `global.data` carries the `__agntcmsPreview` brand we synthesize
  // a matching `PreviewField` wrapper for every default so missing
  // fields render through the editable click-to-edit path rather than
  // arriving as plain strings (which `EditableText` cannot enter edit
  // mode on). The synthesized origin uses `kind: 'global'` and
  // `globalName: name` so descendant editable widgets route saves to
  // `/api/agntcms/global/save` via `GlobalSaveProvider` — the same
  // routing real wrapped fields on a global use.
  const dataRecord = global.data as Record<string, unknown>
  const inPreview = Object.values(dataRecord).some(isPreviewBrand)

  // `definition.defaults` is required on real `SectionDefinition`
  // values, but stub/test definitions occasionally omit it. Coerce to
  // an empty record rather than crashing inside `Object.entries`.
  const rawDefaults = (definition.defaults ?? {}) as Record<string, unknown>
  const wrappedDefaults: Record<string, unknown> = inPreview
    ? Object.fromEntries(
        Object.entries(rawDefaults).map(([key, value]) => [
          key,
          {
            __agntcmsPreview: true,
            value,
            origin: {
              kind: 'global' as const,
              globalName: name,
              pageSlug: `__global__:${name}`,
              sectionId: name,
              fieldPath: key,
              source: 'draft' as const,
              revision: '',
            },
          },
        ]),
      )
    : rawDefaults

  const mergedData = {
    ...wrappedDefaults,
    ...dataRecord,
  }

  // Lift every editable field on the merged data into an
  // `EditableSlot<K, V>` per its schema descriptor — same runtime contract
  // as `<SectionRenderer>` (EDITABILITY_DESIGN.md sub-task 2). The
  // helper passes reference through raw and also passes through any key
  // not present in the schema. List items remain encoded by
  // `wrapItemForPreview` at `<EditableList>` render time.
  const slotProps = wrapSectionProps(mergedData, definition.schema)

  // In published mode, return the rendered component directly — zero
  // overhead, no provider. Slot wrapping is a per-kind shallow lift, so
  // the cost stays cheap; the brand on `EditableSlot` is phantom and
  // adds no allocations beyond the wrapper object itself.
  if (mode === 'published') {
    return <Component {...slotProps} />
  }

  // Preview mode: wrap with a save provider so descendant editable
  // widgets dispatch field saves to the global endpoint. We pass the
  // global's name and type into the provider; the provider reads the
  // `value` from each PreviewField in `global.data` to reconstruct
  // the full data payload on every save.
  //
  // The provider receives the ORIGINAL preview-wrapped data (not the
  // slot-lifted props): it walks the wrappers to read each field's
  // `value` for non-edited fields when patching. Slots are an internal
  // detail of the section-component boundary — the save plumbing
  // continues to operate on the underlying `PreviewField<V>` shape.
  return (
    <GlobalSaveProvider
      globalName={name}
      globalType={global.type}
      initialData={global.data as Readonly<Record<string, unknown>>}
    >
      <Component {...slotProps} />
    </GlobalSaveProvider>
  )
}

/**
 * Render the provided fallback or `null`. Wrapped in a fragment so the
 * return type stays `ReactElement | null` (a fragment IS an element
 * even when its children are nothing).
 */
function renderFallback(fallback: ReactNode | undefined): React.ReactElement | null {
  if (fallback === undefined || fallback === null) return null
  return <>{fallback}</>
}

export type { Global }
