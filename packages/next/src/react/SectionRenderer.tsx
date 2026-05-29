// SectionRenderer — looks up a section's type in the definitions registry
// and renders the matching component with the section's data as props.
//
// This is a SERVER component by default in Next.js App Router. It has no
// "use client" directive, no hooks, no state, no effects. The client
// boundary comes later with editable field components (T-016).
//
// IMPORT CONSTRAINTS (invariant 2):
//   - type-only imports from `domain/` and `sections/` are allowed.
//   - runtime import of `react` is allowed (we render JSX).
//   - NOTHING from storage/, runtime/, mcp/, tasks/, handlers/, config/.

import type { Section } from '../domain/index'
import type { AnySectionDefinition } from '../sections/index'
import { wrapSectionProps } from '../sections/index'

import type { ComponentType } from 'react'

// Structural brand check — mirrors the inline check in the layout-unwrap
// block below. Kept as a module-scope helper (not imported from
// `react/editable/isPreviewField.ts`) to preserve the IMPORT CONSTRAINTS
// above: SectionRenderer must not depend on the editable subtree.
const isPreviewBrand = (
  v: unknown,
): v is { readonly __agntcmsPreview: true; readonly value: unknown } =>
  v !== null && typeof v === 'object' && '__agntcmsPreview' in v

export interface SectionRendererProps {
  /** The section data from the page's sections array. */
  readonly section: Section
  /** The registry of section definitions to look up the component. */
  readonly definitions: readonly AnySectionDefinition[]
}

/**
 * Looks up `section.type` in the `definitions` array and renders the
 * matching component with `section.data` as props.
 *
 * If no matching definition is found: in development, renders a visible
 * red-bordered error box; in production, returns `null` silently.
 */
export function SectionRenderer(props: SectionRendererProps): React.ReactElement | null {
  const { section, definitions } = props

  const definition = definitions.find((d) => d.name === section.type)

  if (!definition) {
    // Development: surface missing definitions visibly so the developer
    // notices immediately instead of debugging a blank spot.
    if (process.env.NODE_ENV !== 'production') {
      return (
        <div
          style={{
            border: '2px solid red',
            padding: '16px',
            margin: '8px 0',
            fontFamily: 'monospace',
            color: 'red',
          }}
        >
          Unknown section type: {section.type}
        </div>
      )
    }

    return null
  }

  // The erased `AnySectionDefinition.component` is typed `(props: never) => unknown`
  // to satisfy contravariance in heterogeneous arrays (see defineSection.ts header).
  // At runtime it IS a real React component. We cast to ComponentType here at the
  // rendering boundary — this is the one place the cast is expected and documented.
  const Component = definition.component as ComponentType<Record<string, unknown>>

  // Merge schema-derived defaults under section data so that fields which were
  // added to the schema AFTER the section was last saved render with a
  // placeholder value instead of `undefined`. Without this, `EditableText`
  // (and similar) can receive `field={undefined}` and crash inside
  // `renderMarkdown`.
  //
  // Preview mode: `section.data` values are wrapped as `PreviewField<unknown>`
  // by `getContent`, while `defaults` are plain values. Naively merging raw
  // defaults under wrapped preview data means missing fields reach the
  // component as plain strings, so `EditableText` can't enter edit mode —
  // the user sees unclickable text. This commonly fires after a schema grows
  // or a layout switch exposes fields that were never saved.
  //
  // Fix: detect preview mode structurally (any value in `section.data` carries
  // the `__agntcmsPreview: true` brand) and synthesize a matching
  // `PreviewField` wrapper for every default. The brand check is inlined to
  // keep SectionRenderer free of `react/editable/` imports (see IMPORT
  // CONSTRAINTS above).
  const dataRecord = section.data as Record<string, unknown>
  const inPreview = Object.values(dataRecord).some(isPreviewBrand)

  const rawDefaults = definition.defaults as Record<string, unknown>
  // Synthesized origin uses `pageSlug: ''`, `revision: ''`, `source: 'draft'`:
  // these fields are not validated by `/api/agntcms/draft/save` and are not
  // consumed by `SectionEditControls.saveField` for non-global sections (which
  // only reads `origin.sectionId` and `origin.fieldPath`). The make-up values
  // are harmless.
  // Published mode (inPreview === false) keeps the exact prior behavior:
  // raw plain defaults pass through with zero new allocations.
  const wrappedDefaults: Record<string, unknown> = inPreview
    ? Object.fromEntries(
        Object.entries(rawDefaults).map(([key, value]) => [
          key,
          {
            __agntcmsPreview: true,
            value,
            origin: {
              pageSlug: '',
              sectionId: section.id,
              fieldPath: key,
              source: 'draft' as const,
              revision: '',
            },
          },
        ]),
      )
    : rawDefaults

  const mergedProps = {
    ...wrappedDefaults,
    ...dataRecord,
  }

  // Lift every editable field on the merged props into an
  // `EditableSlot<K, V>` per its descriptor `kind`. This is the runtime
  // half of EDITABILITY_DESIGN.md sub-task 2: section components now
  // declare slot-typed props (so `<h1>{title}</h1>` is a TS error), and
  // this is the renderer that hands them slots.
  //
  // List / reference values pass through raw from `wrapSectionProps`
  // (see its header for per-kind rationale). Sub-task 3 will replace
  // the list-specific tri-arm union in `wrapItemForPreview` /
  // `EditableList` with `SlotItem<S>`; the list arm is intentionally
  // left untouched here so that change does not need to be done twice.
  const slotProps = wrapSectionProps(mergedProps, definition.schema)

  return <Component {...slotProps} />
}
