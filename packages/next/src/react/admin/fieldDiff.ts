// Per-field diff between two snapshots of the same section's `data`,
// driven by the section's schema. Consumed by the history preview
// pane in AdminModal to render a compact "what changed" panel under
// each modified section.
//
// Why schema-driven: we need to know each field's kind (text,
// richText, image, reference) to decide how to diff it. Without a
// schema we cannot safely walk arbitrary `data`; the caller falls
// back to the section-level "Modified" label in that case. See
// sectionDiffStatus.ts for the baseline/target naming convention.
//
// The `FieldDescriptor` union is CLOSED in v1 (see domain/fields.ts).
// The switch below uses the `never`-returning default pattern so a
// future new field kind becomes a compile error at this site — the
// same approach used in fields.test.ts.
//
// IMPORT CONSTRAINTS:
//   - Imports only from `domain` (types) and `./wordDiff` (sibling).
//   - No React, no storage, no runtime, no mcp.

import type { FieldDescriptor, ImageValue } from '../../domain/fields'
import type { SectionSchema } from '../../domain/schema'
import { wordDiff, type WordDiffOp } from './wordDiff'

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/**
 * Diff entry for a field whose value is or coerces to a single string.
 * Covers text, richText, reference, link, number, boolean, select, and
 * (as a JSON-coerced fallback) list. richText is diffed as markdown
 * source (formatting markers become part of the surrounding word
 * token); reference is diffed as its id/slug string; non-string kinds
 * are coerced via `toDisplayString` before diffing — see that helper
 * for the per-shape rules.
 */
export interface StringFieldDiff {
  readonly kind:
    | 'text'
    | 'richText'
    | 'reference'
    | 'link'
    | 'button'
    | 'number'
    | 'boolean'
    | 'select'
    | 'list'
    | 'video'
  readonly fieldName: string
  readonly ops: readonly WordDiffOp[]
}

/**
 * Diff entry for an image field. Decomposes into two independent
 * string diffs (filename and alt) because both are user-visible and
 * either can change alone. `before`/`after` carry the raw filename
 * strings so the renderer can show before/after thumbnails without
 * re-reading the section data.
 */
export interface ImageFieldDiff {
  readonly kind: 'image'
  readonly fieldName: string
  readonly beforeFilename: string
  readonly afterFilename: string
  readonly filenameOps: readonly WordDiffOp[]
  readonly altOps: readonly WordDiffOp[]
}

export type FieldDiffEntry = StringFieldDiff | ImageFieldDiff

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce an arbitrary runtime value to the string form expected for
 * a text-like field. The runtime type of a reference field's value
 * is documented as a string in `sections/defineSection.ts`, but the
 * domain also carries a `ReferenceValue = { slug: string }` shape
 * used elsewhere. Handle both shapes so a diff still renders if the
 * value was authored either way; anything else falls back to JSON so
 * the user still sees *something* change rather than an empty diff.
 */
function toDisplayString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    // Reference value: { slug }.
    if (typeof obj['slug'] === 'string') return obj['slug']
    // LinkValue (new shape): `{ type: 'internal', slug, label }` or
    // `{ type: 'external', url, label }`. Render as "label → target"
    // where target is the slug or URL, so both sides participate in
    // the word-level diff (changing either creates a visible diff).
    if (
      (obj['type'] === 'internal' && typeof obj['slug'] === 'string') ||
      (obj['type'] === 'external' && typeof obj['url'] === 'string')
    ) {
      const label = typeof obj['label'] === 'string' ? obj['label'] : ''
      const target = obj['type'] === 'internal' ? (obj['slug'] as string) : (obj['url'] as string)
      return `${label} → ${target}`
    }
    // Legacy LinkValue (`{ href, label }`) — kept for the migration
    // window so a diff against a pre-migration history snapshot still
    // renders something readable. Once skills-dev rewrites historical
    // snapshots, this branch becomes dead code.
    if (typeof obj['href'] === 'string' && typeof obj['label'] === 'string') {
      return `${obj['label']} → ${obj['href']}`
    }
    // ButtonValue: `{ label, variant, link? }`. Render as
    // "label / variant" when there's no link, "label / variant → target"
    // when there is one. Both label and variant participate in the
    // word-level diff so changing either shows up; the optional link
    // target is appended when present.
    if (typeof obj['label'] === 'string' && typeof obj['variant'] === 'string') {
      const head = `${obj['label']} / ${obj['variant']}`
      const link = obj['link']
      if (link !== null && typeof link === 'object') {
        const lo = link as Record<string, unknown>
        if (lo['type'] === 'internal' && typeof lo['slug'] === 'string') return `${head} → ${lo['slug']}`
        if (lo['type'] === 'external' && typeof lo['url'] === 'string') return `${head} → ${lo['url']}`
        if (lo['type'] === 'email' && typeof lo['email'] === 'string') return `${head} → ${lo['email']}`
        if (lo['type'] === 'phone' && typeof lo['phone'] === 'string') return `${head} → ${lo['phone']}`
      }
      return head
    }
    try {
      return JSON.stringify(v)
    } catch {
      return ''
    }
  }
  return String(v)
}

function isImageValue(v: unknown): v is ImageValue {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o['filename'] === 'string' && typeof o['alt'] === 'string'
}

function stringDiffEntry(
  kind: StringFieldDiff['kind'],
  fieldName: string,
  before: unknown,
  after: unknown,
): StringFieldDiff | null {
  const b = toDisplayString(before)
  const a = toDisplayString(after)
  if (b === a) return null
  return { kind, fieldName, ops: wordDiff(b, a) }
}

function imageDiffEntry(
  fieldName: string,
  before: unknown,
  after: unknown,
): ImageFieldDiff | null {
  // If either side isn't a proper ImageValue, fall back to treating
  // the whole thing as a string-coerced diff of whatever is there.
  // We still emit an ImageFieldDiff so the renderer knows to split
  // into filename/alt rows — the alt side will be empty when absent.
  const beforeImg: ImageValue = isImageValue(before)
    ? before
    : { filename: toDisplayString(before), alt: '' }
  const afterImg: ImageValue = isImageValue(after)
    ? after
    : { filename: toDisplayString(after), alt: '' }

  if (
    beforeImg.filename === afterImg.filename &&
    beforeImg.alt === afterImg.alt
  ) {
    return null
  }

  return {
    kind: 'image',
    fieldName,
    beforeFilename: beforeImg.filename,
    afterFilename: afterImg.filename,
    filenameOps: wordDiff(beforeImg.filename, afterImg.filename),
    altOps: wordDiff(beforeImg.alt, afterImg.alt),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produce a list of per-field diff entries between two data snapshots
 * of the same section. Unchanged fields are omitted. Fields present
 * in `data` but not in `schema` are skipped — the schema is the
 * contract, extra keys are not authoritative.
 *
 * Empty list means "no field differs" — callers should treat that as
 * "nothing to render" rather than "unknown". The section-level
 * `modified` status from `sectionDiffStatus` already determines
 * whether this helper gets called at all.
 */
export function fieldDiff(
  schema: SectionSchema,
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): readonly FieldDiffEntry[] {
  const entries: FieldDiffEntry[] = []

  for (const fieldName of Object.keys(schema)) {
    const descriptor: FieldDescriptor = schema[fieldName] as FieldDescriptor
    const b = before[fieldName]
    const a = after[fieldName]

    // Exhaustive switch over FieldDescriptor['kind']. A future new
    // built-in field kind must be handled here — the `never` default
    // guarantees that omission is a compile error, not a silent gap.
    // Rationale (see domain/fields.ts:10-13): the field-kind set is
    // CLOSED and consistency of the editing UI depends on knowing
    // every possible kind ahead of time.
    switch (descriptor.kind) {
      case 'text': {
        const entry = stringDiffEntry('text', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'richText': {
        const entry = stringDiffEntry('richText', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'reference': {
        const entry = stringDiffEntry('reference', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'image': {
        const entry = imageDiffEntry(fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'video': {
        // VideoValue is still compact (`{ url, aspectRatio?, caption? }`)
        // — collapse to a JSON-string diff. Mirrors how `list` is
        // handled today; the JSON shape is small enough that a
        // structural per-slot diff would be more cost than benefit.
        // A richer structural diff is a deferred enhancement
        // (ARCHITECTURE.md §12).
        const entry = stringDiffEntry('video', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'link': {
        const entry = stringDiffEntry('link', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'button': {
        // Button diff renders as "label / variant" (plus optional
        // "→ target" when a link is attached). `toDisplayString` owns
        // that compact projection so all three sub-parts participate in
        // a single word-level diff — sufficient for the history modal,
        // and consistent with how `link` collapses to a one-line
        // string-diff. A structural per-slot diff is a deferred
        // enhancement (ARCHITECTURE.md §12), same precedent as `list` /
        // `video`.
        const entry = stringDiffEntry('button', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'number': {
        const entry = stringDiffEntry('number', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'boolean': {
        const entry = stringDiffEntry('boolean', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'select': {
        const entry = stringDiffEntry('select', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      case 'list': {
        // Per-item structural diff would mirror sectionDiffStatus, but
        // for v1 we collapse the list to a JSON string and word-diff it.
        // The history modal still surfaces "this list changed"; richer
        // per-item diff is a deferred enhancement (ARCHITECTURE.md §12).
        const entry = stringDiffEntry('list', fieldName, b, a)
        if (entry !== null) entries.push(entry)
        break
      }
      default: {
        // Compile-time exhaustiveness guard. If a new FieldDescriptor
        // kind is added, TypeScript will report that the value is no
        // longer `never` and fail the build here.
        const _exhaustive: never = descriptor
        void _exhaustive
      }
    }
  }

  return entries
}
