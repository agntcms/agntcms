'use client'

// -----------------------------------------------------------------------
// SectionPickerModal — full-screen modal showing live component previews
// at 20% scale for section type selection (replace or insert flows).
//
// Uses the shared Modal shell (../shared/Modal) for overlay/panel/header/
// close/escape/backdrop mechanics. This module focuses on the grid and
// preview-card rendering.
//
// IMPORT CONSTRAINTS (invariant 2):
//   - Only `react`, the shared Modal, and local files.
//   - No server-side imports. No storage, no mcp.
// -----------------------------------------------------------------------

import { useEffect, useCallback, useRef, useState, type ReactElement } from 'react'

import type { SectionSchema } from '../../domain/index'
import { wrapSectionProps } from '../../sections/index'
import { Modal } from '../shared/Modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a section definition needed by the picker.
 * Kept deliberately narrow so the modal doesn't depend on the full
 * domain `SectionDefinition` type at runtime — only at the call site.
 *
 * `schema` and `label` are optional because the picker itself does
 * not need them. They are surfaced here so consumers can find a
 * section's field-descriptor map and human label without a parallel
 * definitions channel. At runtime every real `AnySectionDefinition`
 * carries both, so the optional declaration is a type-system
 * relaxation rather than a runtime contract change.
 */
export interface DefinitionLike {
  readonly name: string
  readonly category?: string
  readonly component: (props: never) => unknown
  /**
   * Pre-computed defaults. Values are `unknown` because each field
   * kind produces its own default shape — v1 built-ins all resolve
   * to strings (text, image-filename, reference id), but keeping the
   * channel lossless avoids breaking downstream if a future built-in
   * introduces a non-string value. Preview cards cast the definition's
   * component to the right shape at render time.
   */
  readonly defaults?: Record<string, unknown>
  /**
   * Optional richer sample content used ONLY by this modal's preview
   * cards. Merged SHALLOW over `defaults` at card-render time; insertion
   * paths must keep using `defaults` alone. See
   * `SectionDefinition.previewData` for the authoring-side contract.
   */
  readonly previewData?: Record<string, unknown>
  /**
   * Field-descriptor schema. Optional in the type because tests and
   * isolated callers may build minimal stubs; in practice every real
   * definition supplies it.
   */
  readonly schema?: SectionSchema
  /** Optional human-friendly label. Falls back to `name`. */
  readonly label?: string
  /**
   * Framework-managed flag (mirrors `SectionDefinition.system`). When
   * `true`, the picker omits this definition from both the sections grid
   * and any "Globals" group entry whose type points at this section.
   * See ARCHITECTURE.md §3 "Section registration" and `defineSection.ts`.
   * Default: `false`.
   */
  readonly system?: boolean
}

// ---------------------------------------------------------------------------
// mergePreviewProps — pure helper that builds the preview-card prop record
// for a definition. Extracted out of `SectionPreviewCard` /
// `GlobalPreviewCard` so it can be exercised by the vitest node-env suite
// without rendering a `'use client'` component that uses hooks (see
// `feedback_pure_helpers_for_node_tests`).
//
// Merge semantics: SHALLOW per-key, `previewData` wins over `defaults`. No
// deep merge — fields are atomic from the picker's POV; a list-field
// override replaces the empty array wholesale, an image override replaces
// the placeholder image wholesale. KISS.
// ---------------------------------------------------------------------------

export function mergePreviewProps(
  definition: Pick<DefinitionLike, 'defaults' | 'previewData'>,
): Record<string, unknown> {
  return { ...(definition.defaults ?? {}), ...(definition.previewData ?? {}) }
}

/**
 * A global content block entry as returned by /api/agntcms/global/list.
 * Kept minimal — we only need name and type for display and selection.
 */
export interface GlobalEntry {
  readonly name: string
  readonly type: string
  /**
   * Server-resolved system flag (the handler looks up the entry's `type`
   * in the registered `systemTypes`). Optional on the wire for forward
   * compatibility: an older server that doesn't send the field is
   * treated as "no system globals" (the picker shows everything).
   */
  readonly system?: boolean
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests (vitest node env). The modal itself
// can't be rendered in the node env because of React hooks, so each filter
// is split off here.
// ---------------------------------------------------------------------------

/**
 * Drops definitions flagged `system: true`. Framework-managed sections
 * (e.g. site-meta) are configuration, not user content, and must not
 * appear in the section picker grid.
 */
export function filterSystemDefinitions(
  definitions: readonly DefinitionLike[],
): readonly DefinitionLike[] {
  return definitions.filter((d) => d.system !== true)
}

/**
 * Drops global entries whose server-resolved `system` flag is `true`.
 * A system-flagged global is framework configuration (read directly by
 * frozen helpers) and inserting it as a `<GlobalSlot>` reference into a
 * page would be a category error.
 */
export function filterSystemGlobals(
  globals: readonly GlobalEntry[],
): readonly GlobalEntry[] {
  return globals.filter((g) => g.system !== true)
}

export interface SectionPickerModalProps {
  /** Whether the modal is open. */
  readonly open: boolean
  /** Called when the modal should close. */
  readonly onClose: () => void
  /** Called when a section type is selected. */
  readonly onSelect: (typeName: string) => void
  /** Available section definitions to display. */
  readonly definitions: readonly DefinitionLike[]
  /** Title shown in the modal header. */
  readonly title: string
  /** Called when a global is selected instead of a section type.
   *  When omitted, the globals group is not shown (backwards compatible). */
  readonly onSelectGlobal?: (globalName: string) => void
  /**
   * The section currently being edited. When provided, the Replace
   * grid hides the current type to keep the list of alternatives clean.
   *
   * `data` is a plain record (not a PreviewField-wrapped one). Callers in
   * preview mode must strip wrappers before passing.
   */
  readonly currentSection?: {
    readonly id: string
    readonly type: string
    readonly data: Record<string, unknown>
  }
}

// ---------------------------------------------------------------------------
// Layout constants — match the old project's proven scale approach.
// Full viewport width rendered in a card-sized container.
// ---------------------------------------------------------------------------

const FULL_WIDTH = 1440
const CARD_WIDTH = 288
const SCALE = CARD_WIDTH / FULL_WIDTH // ~0.2
const CARD_HEIGHT = 176

// ---------------------------------------------------------------------------
// Inline styles — consistent with SectionReplaceOverlay.tsx theming.
// ---------------------------------------------------------------------------

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 8,
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid transparent',
  background: 'none',
  transition: 'border-color 0.15s, background 0.15s',
}

const previewContainerStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
  overflow: 'hidden',
  borderRadius: 8,
  border: '1px solid var(--agntcms-admin-border)',
  background: 'var(--agntcms-admin-surface-raised)',
}

// Absolute positioning keeps the 1440px-wide layout box out of the
// grid's min-content calculation (otherwise each card blows out to
// 1440px wide). Centering trick: `translate(-50%, -50%)` uses the
// layout size to place the layout center at the container center,
// then `scale(SCALE)` around `center center` shrinks the visual
// around that same center — works for any natural height.
const previewInnerStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: FULL_WIDTH,
  transform: `translate(-50%, -50%) scale(${SCALE})`,
  transformOrigin: 'center center',
  pointerEvents: 'none',
}

const labelStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-muted)',
  textAlign: 'center',
}

const emptyStyle: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const searchWrapStyle: React.CSSProperties = {
  marginBottom: 16,
  flexShrink: 0,
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-surface-raised)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 6,
  outline: 'none',
}

const noMatchesStyle: React.CSSProperties = {
  padding: '32px 24px',
  textAlign: 'center',
  fontSize: 13,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
}

const groupLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  marginBottom: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const globalBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg)',
  background: 'var(--agntcms-admin-border)',
  borderRadius: 4,
  padding: '1px 6px',
  marginLeft: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  verticalAlign: 'middle',
}

const globalCardBorderStyle: React.CSSProperties = {
  ...cardStyle,
  border: '1px solid var(--agntcms-admin-border)',
}

const globalSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-body, sans-serif)',
  color: 'var(--agntcms-admin-fg-dim)',
  textAlign: 'center',
  marginTop: 2,
}

// ---------------------------------------------------------------------------
// Grouping helper — groups definitions by category, preserving insertion order.
// ---------------------------------------------------------------------------

interface DefinitionGroup {
  readonly label: string
  readonly items: DefinitionLike[]
}

function groupDefinitions(definitions: readonly DefinitionLike[]): DefinitionGroup[] {
  const groups = new Map<string, DefinitionLike[]>()
  for (const def of definitions) {
    const label = def.category ?? 'Other'
    const existing = groups.get(label)
    if (existing) {
      existing.push(def)
    } else {
      groups.set(label, [def])
    }
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

// ---------------------------------------------------------------------------
// Pure substring filter — exported so the unit suite (vitest node env) can
// exercise the matching logic without rendering the modal. KISS: plain
// case-insensitive substring match against name OR category. No fuzzy
// matching, no scoring, no debounce — the picker holds ~30 entries.
//
// An empty/whitespace-only query returns the input list untouched (referential
// equality preserved) so the caller can early-out without rebuilding groups.
// ---------------------------------------------------------------------------

export function filterDefinitions(
  definitions: readonly DefinitionLike[],
  query: string,
): readonly DefinitionLike[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') return definitions
  return definitions.filter((def) => {
    if (def.name.toLowerCase().includes(trimmed)) return true
    if (def.category && def.category.toLowerCase().includes(trimmed)) return true
    return false
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionPreviewCard(props: {
  readonly definition: DefinitionLike
  readonly onSelect: (typeName: string) => void
}): ReactElement {
  const { definition, onSelect } = props
  // Cast at the rendering boundary: the registry stores components as
  // `(props: never) => unknown` for variance safety; here we know the
  // props are whatever the definition's schema implies. The preview
  // card passes `defaults` verbatim — image defaults are objects,
  // text defaults are strings — and the component handles both.
  const Component = definition.component as React.ComponentType<Record<string, unknown>>
  // `previewData` (when supplied by the section author) lays richer sample
  // content over `defaults` for picker-card cosmetics ONLY. Insertion of a
  // new section is unchanged and still uses `defaults` alone (see
  // `SectionEditControls.handleSelect`).
  const merged = mergePreviewProps(definition)
  // Lift the merged record into `EditableSlot<K, V>` for editable kinds —
  // the section component declares slot-typed props after sub-task 2 of
  // EDITABILITY_DESIGN.md. List / reference pass through raw. Schema may
  // be undefined on stub definitions in tests, in which case
  // `wrapSectionProps` is a shallow copy (no slots) and the cast below
  // is benign.
  const slotProps = wrapSectionProps(merged, definition.schema)

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = 'var(--agntcms-admin-border)'
    e.currentTarget.style.background = 'var(--agntcms-admin-surface-raised)'
  }, [])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = 'transparent'
    e.currentTarget.style.background = 'none'
  }, [])

  const handleClick = useCallback(() => {
    onSelect(definition.name)
  }, [onSelect, definition.name])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(definition.name)
      }
    },
    [onSelect, definition.name],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      style={cardStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={previewContainerStyle}>
        <div style={previewInnerStyle}>
          <Component {...slotProps} />
        </div>
      </div>
      <div style={labelStyle}>{definition.name}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GlobalPreviewCard — shows a global instance in the picker. Renders the
// section type's default preview (we don't have the global's real data on
// the client), labeled with the global's name + a "Global" badge.
// ---------------------------------------------------------------------------

function GlobalPreviewCard(props: {
  readonly entry: GlobalEntry
  readonly definitions: readonly DefinitionLike[]
  readonly onSelectGlobal: (globalName: string) => void
}): ReactElement {
  const { entry, definitions, onSelectGlobal } = props
  const definition = definitions.find((d) => d.name === entry.type)
  // Same slot-lift as `SectionPreviewCard` — section components declare
  // slot-typed props after sub-task 2 of EDITABILITY_DESIGN.md, so the
  // preview card must hand them slots even when seeded only from defaults.
  const Component = definition
    ? (definition.component as React.ComponentType<Record<string, unknown>>)
    : null
  // Globals reuse the section type's `previewData` (no per-instance preview
  // data on the client — we don't have the global's real saved data here).
  // Same merge contract as `SectionPreviewCard`.
  const merged = definition ? mergePreviewProps(definition) : {}
  const slotProps = definition
    ? wrapSectionProps(merged, definition.schema)
    : merged

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = 'var(--agntcms-admin-fg-dim)'
    e.currentTarget.style.background = 'var(--agntcms-admin-surface-raised)'
  }, [])

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.borderColor = 'var(--agntcms-admin-border)'
    e.currentTarget.style.background = 'none'
  }, [])

  const handleClick = useCallback(() => {
    onSelectGlobal(entry.name)
  }, [onSelectGlobal, entry.name])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelectGlobal(entry.name)
      }
    },
    [onSelectGlobal, entry.name],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      style={globalCardBorderStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={previewContainerStyle}>
        <div style={previewInnerStyle}>
          {Component ? <Component {...slotProps} /> : null}
        </div>
      </div>
      <div style={labelStyle}>
        {entry.name}
        <span style={globalBadgeStyle}>Global</span>
      </div>
      <div style={globalSubtitleStyle}>{entry.type}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SectionPickerModal(
  props: SectionPickerModalProps,
): ReactElement | null {
  const {
    open,
    onClose,
    onSelect,
    definitions,
    title,
    onSelectGlobal,
    currentSection,
  } = props

  // Search query for filtering the section list. Reset to '' when the modal
  // closes so reopening starts fresh — users expect each opening to be a
  // clean picker, not a resumption of an earlier search.
  const [query, setQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    // Autofocus on open. Done via ref+effect rather than the `autoFocus`
    // attribute because the Modal mounts/unmounts on open toggling and we
    // want focus on every reopen, not just first mount.
    searchInputRef.current?.focus()
  }, [open])

  // Fetch globals when the modal opens and the caller wants global selection.
  // Graceful degradation: if the fetch fails, globals stays empty and the
  // picker still works for regular section types.
  const [globals, setGlobals] = useState<readonly GlobalEntry[]>([])

  useEffect(() => {
    if (!open || !onSelectGlobal) {
      // Reset when closed so stale data doesn't flash on reopen.
      setGlobals([])
      return
    }

    let cancelled = false

    fetch('/api/agntcms/global/list')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
        return res.json() as Promise<{ globals: ReadonlyArray<{ name: string; type: string; system?: boolean }> }>
      })
      .then((body) => {
        if (!cancelled) {
          // Forward `system` verbatim — `filterSystemGlobals` below uses
          // it to drop framework-managed entries. Default to `false`
          // when the server didn't include the field (forward
          // compatibility with older handlers).
          setGlobals(
            body.globals.map((g) => ({
              name: g.name,
              type: g.type,
              system: g.system ?? false,
            })),
          )
        }
      })
      .catch(() => {
        if (!cancelled) setGlobals([])
      })

    return () => {
      cancelled = true
    }
  }, [open, onSelectGlobal])

  // When editing an existing section, the current type is redundant in the
  // Replace grid — the caller (SectionReplaceOverlay) now passes the full
  // list so the Layout tab can look up the current definition; we filter
  // here for the Replace grid specifically. The insert flow does not pass
  // `currentSection`, so the grid stays unfiltered for that caller.
  //
  // System-flagged definitions are dropped unconditionally — they are
  // framework-managed configuration (e.g. site-meta) and must not be
  // pickable as a section to insert/replace into a page.
  const visibleDefinitions = filterSystemDefinitions(definitions)
  const replaceDefinitions = currentSection
    ? visibleDefinitions.filter((d) => d.name !== currentSection.type)
    : visibleDefinitions
  // Apply the substring filter before grouping so empty categories drop out
  // naturally. When the query is empty, filterDefinitions returns the input
  // unchanged (same reference) — no grouping cost regression.
  const filtered = filterDefinitions(replaceDefinitions, query)
  const groups = filtered.length > 0 ? groupDefinitions(filtered) : []
  // Suppress the "Other" heading when every definition is uncategorized —
  // the single label adds visual noise without information.
  const showLabels = !(groups.length === 1 && groups[0]?.label === 'Other')

  // System-flagged globals are framework configuration (e.g. site-meta SEO
  // defaults); they do not appear in user-facing pickers regardless of
  // whether a `GlobalSlot` for them exists in the layout.
  const visibleGlobals = filterSystemGlobals(globals)
  const hasGlobals = onSelectGlobal && visibleGlobals.length > 0
  // When globals are shown alongside section groups, always show group labels
  // so the distinction between "GLOBALS" and section categories is clear.
  const effectiveShowLabels = hasGlobals || showLabels

  // Distinguish "user has typed a query" from "registry is empty" so we can
  // show a query-specific empty state without misreporting an empty registry.
  const isSearching = query.trim() !== ''
  const noMatches = isSearching && groups.length === 0

  // z-index 100000 — this modal is opened from preview mode, where
  // PreviewToolbar sits at 99999 and must be overlaid.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<h2 style={titleStyle}>{title}</h2>}
      ariaLabel={title}
      zIndex={100000}
    >
      <div style={searchWrapStyle}>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
          placeholder="Search sections..."
          aria-label="Search sections"
          style={searchInputStyle}
        />
      </div>

      {/* Globals group — rendered first so shared elements are prominent.
          Hidden while the user is searching: the query is matched against
          section definitions only, not global instance names. */}
      {hasGlobals && !isSearching && (
        <div style={{ marginBottom: 24 }}>
          <div style={groupLabelStyle}>Globals</div>
          <div style={gridStyle}>
            {visibleGlobals.map((entry) => (
              <GlobalPreviewCard
                key={`global:${entry.name}`}
                entry={entry}
                definitions={definitions}
                onSelectGlobal={onSelectGlobal}
              />
            ))}
          </div>
        </div>
      )}

      {noMatches ? (
        <div style={noMatchesStyle}>{`No sections match "${query.trim()}"`}</div>
      ) : groups.length === 0 && !hasGlobals ? (
        <div style={emptyStyle}>No section types available</div>
      ) : (
        groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 24 }}>
            {effectiveShowLabels && <div style={groupLabelStyle}>{group.label}</div>}
            <div style={gridStyle}>
              {group.items.map((def) => (
                <SectionPreviewCard
                  key={def.name}
                  definition={def}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </Modal>
  )
}
