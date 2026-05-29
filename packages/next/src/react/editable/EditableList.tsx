'use client'

// EditableList — repeater widget for a ListField value.
//
// Preview UX — list items: visible content edits inline; ✎ button opens
// a modal scoped to non-inline meta fields when the schema has any.
//
// The list renders the user's renderItem for every existing entry —
// real cards, not forms — wrapped in an overlay that exposes
// ✎ / ↑ / ↓ / × affordances on hover or focus. The ✎ button is rendered
// ONLY when the item schema declares at least one modal-eligible field
// (`hasModalEligibleFields`); for schemas whose every field is
// inline-eligible (text/richText/image/link/list), the ✎ button is
// suppressed because the modal would have nothing to show. A trailing
// "+ Add item" placeholder appends a blank item directly with descriptor
// defaults; the user edits inline first, then opens ✎ to set meta
// fields if they want.
//
// Inline editing: the renderItem callback receives a `SlotItem<S>` in
// BOTH modes — every editable field arrives as an `EditableSlot<K, V>`
// so the section author can drop `<EditableRichText field={item.title}>`
// directly inside the card and write `read(item.cta)` for non-editable
// utilities. In preview mode, the slot's `value` carries a
// `PreviewFieldLike<…>` augmented with an inline-save closure (see
// `wrapItemForPreview`); in published mode, the slot's `value` is the
// bare data (see `wrapItemAsSlot`). Visible editorial fields
// (text/richText/image/link/list) are edited inline. Meta/technical
// fields (number/boolean/select/video/reference) are reached only
// through the ✎ modal so the preview surface stays free of form chrome.
// See `wrapItemForPreview.ts` and `ItemFormEditor.isModalEligible` for
// the policy.
//
// Save unit:
//   The List as a whole is one save unit. Any change (add / remove /
//   reorder / per-item field edit) re-emits the FULL array through the
//   parent's `onSave`. Why one save unit and not per-item:
//     - The runtime wraps section-level fields one level deep. There is
//       no per-item PreviewFieldOrigin — origin metadata only exists at
//       the section-field boundary. Persisting a per-item edit must go
//       through the list's origin, which means handing back the whole
//       array.
//     - Add/remove inherently need the full new array anyway.
//
// Published mode:
//   The list renders nothing on its own. Section components consume the
//   array directly (`array.map(...)`) and use the other Editable*
//   components inline if they want, or just render plain values. That
//   mirrors how EditableText/Image behave in published mode.
//
// IMPORT CONSTRAINTS:
//   - "use client" component. Must NOT import from storage/, runtime/,
//     mcp/, tasks/, handlers/, config/.
//   - Uses only react, sibling editable/ files, and type-only imports
//     of descriptor types from `domain/`.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ListItem, SectionSchema } from '../../domain/index'
import type { EditableSlot, SlotItem } from '../../sections/index'
import { Modal } from '../shared/Modal'
import { ItemFormEditor, buildBlankItem, isModalEligible } from './ItemFormEditor'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
import { findWrappedFieldByPath, stripListItemPrefix } from './findWrappedFieldByPath'
import { SaveProvider, useSaveField } from './SaveContext'
import type { SaveFieldFn } from './SaveContext'
import { wrapItemAsSlot, wrapItemForPreview } from './wrapItemForPreview'

type AnyItem = ListItem<SectionSchema>

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface EditableListProps<S extends SectionSchema = SectionSchema> {
  /**
   * The slot for this list field. SectionRenderer hands every editable
   * field through `wrapAsSlot` (EDITABILITY_DESIGN.md sub-tasks 2 / 3),
   * so the component receives an
   * `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>` whose `slot.value`
   * is either a raw items array (published) or a
   * `PreviewFieldLike<ReadonlyArray<…>>` carrying the list-level origin
   * (preview).
   *
   * The runtime element type inside the array is `ListItem<S>` (bare
   * items); the type asserts `SlotItem<S>` because the section author
   * never sees the bare item directly — `<EditableList renderItem>`
   * produces the slot-typed shape at render time via
   * `wrapItemForPreview` (preview) or `wrapItemAsSlot` (published).
   * Items are structurally compatible: the slot brand is phantom and
   * adds no runtime keys.
   */
  readonly field: EditableSlot<'list', ReadonlyArray<SlotItem<S>>>
  /**
   * The item schema. Section components MUST pass the same schema they
   * declared in their descriptor — this is the schema the editor uses
   * to render per-field controls inside each item card.
   */
  readonly itemSchema: S
  /** Optional minimum number of items the editor will keep visible. */
  readonly min?: number
  /** Optional maximum number of items the editor will allow. */
  readonly max?: number
  /** Additional className applied to the wrapper. */
  readonly className?: string
  /**
   * Render an item.
   *
   * `item` arrives as a `SlotItem<S>` in BOTH modes: every editable
   * field on the schema is an `EditableSlot<K, V>`, and the section
   * author drops `<EditableRichText field={item.title}>` straight into
   * the card. In preview mode the slot's `value` carries a
   * `PreviewFieldLike<…>` (with origin + inline-save closure); in
   * published mode the slot's `value` is the bare data. A single
   * `renderItem` body works in both modes.
   *
   * Falls back to `JSON.stringify` (using the bare items) when not
   * provided so the editor at least sees something. */
  readonly renderItem?: (item: SlotItem<S>, index: number) => React.ReactNode
  /** Called when the user mutates the array in preview mode. */
  readonly onSave?: (
    origin: PreviewFieldLike<ReadonlyArray<AnyItem>>['origin'],
    newValue: ReadonlyArray<AnyItem>,
  ) => void
}

export function EditableList<S extends SectionSchema = SectionSchema>(
  props: EditableListProps<S>,
): React.ReactElement {
  const { field: slot, itemSchema, className, renderItem } = props

  // The slot is the public prop; the inner branches consume the
  // underlying value via `slot.value`. In preview mode `slot.value` is
  // a `PreviewFieldLike<ReadonlyArray<…>>` (carries the list-level
  // origin and a same-shaped onSave for add/remove/reorder); in
  // published mode it is the raw items array. The runtime element type
  // is `ListItem<S>`; the slot's TYPE asserts `SlotItem<S>` because
  // each item is wrapped through `wrapItemAsSlot` / `wrapItemForPreview`
  // before reaching `renderItem`.
  const inner = slot.value as
    | ReadonlyArray<AnyItem>
    | PreviewFieldLike<ReadonlyArray<AnyItem>>

  // Published mode: render through the user's `renderItem` prop; if
  // absent, fall back to a numbered list (using the bare items —
  // `JSON.stringify` would dump the slot brand otherwise). Section
  // components are expected to provide their own item rendering — the
  // framework doesn't know what visual form an item should take.
  if (!isPreviewField<ReadonlyArray<AnyItem>>(inner)) {
    if (renderItem === undefined) {
      return (
        <ol className={className}>
          {inner.map((item) => (
            <li key={item._id}>{JSON.stringify(item)}</li>
          ))}
        </ol>
      )
    }
    return (
      <div className={className}>
        {inner.map((item, idx) => (
          <div key={item._id}>
            {renderItem(
              wrapItemAsSlot<S>(item as unknown as ListItem<S>, itemSchema),
              idx,
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <EditableListPreview
      field={inner}
      itemSchema={props.itemSchema}
      className={className}
      renderItem={renderItem}
      min={props.min}
      max={props.max}
      onSave={props.onSave}
    />
  )
}

// ---------------------------------------------------------------------------
// Preview-mode body
// ---------------------------------------------------------------------------

interface EditableListPreviewProps<S extends SectionSchema> {
  readonly field: PreviewFieldLike<ReadonlyArray<AnyItem>>
  readonly itemSchema: S
  readonly className: string | undefined
  readonly renderItem: ((item: SlotItem<S>, index: number) => React.ReactNode) | undefined
  readonly min: number | undefined
  readonly max: number | undefined
  readonly onSave:
    | ((
        origin: PreviewFieldLike<ReadonlyArray<AnyItem>>['origin'],
        newValue: ReadonlyArray<AnyItem>,
      ) => void)
    | undefined
}

// Modal state for the ✎ "Edit fields" button. Only one row's modal can
// be open at a time. `draft` mirrors the row's value while the user
// edits — Save commits it back through the list, Cancel discards.
type ListEditModalState =
  | { readonly mode: 'closed' }
  | { readonly mode: 'edit'; readonly index: number; readonly draft: AnyItem }

function EditableListPreview<S extends SectionSchema>(
  props: EditableListPreviewProps<S>,
): React.ReactElement {
  const { field, itemSchema, className, renderItem, min, max, onSave } = props
  const contextSave = useSaveField()
  const [modal, setModal] = useState<ListEditModalState>({ mode: 'closed' })

  const items = field.value

  // Whether the item schema has any modal-eligible (meta/non-inline)
  // fields. When false, every field is inline-editable and there is
  // nothing for the ✎ modal to show — we suppress the button entirely
  // rather than open an empty modal. Computed once per render: the
  // schema is a stable user-supplied object so the result is also
  // effectively stable.
  const hasModalEligibleFields = Object.values(itemSchema).some(isModalEligible)

  const commit = useCallback(
    (next: ReadonlyArray<AnyItem>) => {
      const saveFn = onSave ?? contextSave
      if (saveFn) saveFn(field.origin, next)
    },
    [field.origin, onSave, contextSave],
  )

  const removeItem = useCallback(
    (index: number) => {
      // The min-guard runs FIRST: if the action would be a no-op (we're
      // already at the floor), don't even prompt the user. Same ordering
      // as SectionDeleteButton's silent-noop-on-busy in
      // preview/SectionEditControls.tsx.
      if (min !== undefined && items.length <= min) return
      // Native browser confirm — mirrors the section-delete UX
      // (`Remove this section?`) so deletion is consistent across the
      // editor. No custom modal here on purpose: KISS.
      // eslint-disable-next-line no-restricted-globals
      if (!confirm('Remove this item?')) return
      commit(items.filter((_, i) => i !== index))
    },
    [items, min, commit],
  )

  const moveItem = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= items.length) return
      const next = items.slice()
      const [moved] = next.splice(from, 1) as [AnyItem]
      next.splice(to, 0, moved)
      commit(next)
    },
    [items, commit],
  )

  const openAdd = useCallback(() => {
    if (max !== undefined && items.length >= max) return
    // Always direct-commit a blank item with descriptor defaults. The
    // user edits the appended card inline first; if the schema has
    // meta fields they are reached through the row's ✎ button (which
    // appears only when `hasModalEligibleFields` is true). The "+ Add"
    // path itself never opens the modal — that's a deliberate
    // simplification: if the user adds a row by mistake, deleting a
    // blank card is one click on ×.
    const blank = buildBlankItem(itemSchema)
    commit([...items, blank])
  }, [items, max, itemSchema, commit])

  const openEdit = useCallback(
    (index: number) => {
      const target = items[index]
      if (target === undefined) return
      setModal({ mode: 'edit', index, draft: target })
    },
    [items],
  )

  const handleDraftChange = useCallback((next: AnyItem) => {
    setModal((current) =>
      current.mode === 'edit' ? { mode: 'edit', index: current.index, draft: next } : current,
    )
  }, [])

  const handleModalSave = useCallback(() => {
    if (modal.mode !== 'edit') return
    // Replace the row at the modal's index with its draft. The whole
    // list is the save unit (see file header), so we re-emit the full
    // array through `commit`.
    const next = items.map((it, i) => (i === modal.index ? modal.draft : it))
    commit(next)
    setModal({ mode: 'closed' })
  }, [modal, items, commit])

  const handleModalCancel = useCallback(() => {
    setModal({ mode: 'closed' })
  }, [])

  const canRemove = min === undefined || items.length > min
  const canAdd = max === undefined || items.length < max

  // Render — use the user's wrapper className so the parent grid (e.g.
  // `grid grid-cols-3 gap-6`) lays out cards naturally, identical to
  // published mode. The editor adds NO outer outline or padding here:
  // any wrapper styling the framework adds would distort the user's
  // layout. The data attribute is preserved so external selectors can
  // still find the list root.
  //
  // The `<style>` tag is hoisted here and emitted ONCE per list rather
  // than per item — N items used to render N identical stylesheets.
  // Same pattern as `EditableRichTextPreview`.
  return (
    <>
      <style>{HOVER_STYLE_TAG}</style>
      <div
        className={className}
        data-agntcms-editable="list"
        data-agntcms-field={field.origin.fieldPath}
      >
        {items.map((item, idx) => {
          // Wrap the item ON EVERY RENDER so the inline-save closures
          // see the latest `items` array. `commit` itself is stable
          // across renders for the same `field.origin`/`onSave` —
          // memoising the wrap would defeat the liveness contract
          // documented in `wrapItemForPreview.ts`.
          //
          // `item` and `items` are typed `AnyItem`-shaped here because
          // `EditableListProps.field` is intentionally wide (so section
          // components with `Props.features: AnyListItem[]` assign
          // cleanly). The wrap is invoked at the precise generic `S`
          // (recovered from `itemSchema`); we cast here to bridge the
          // wide-to-narrow gap. The cast is safe because authors who
          // use `<EditableList>` MUST pass an array whose items match
          // the schema — that's the same contract the published-mode
          // `renderItem` already relies on.
          const wrapped = wrapItemForPreview<S>(
            item as unknown as ListItem<S>,
            itemSchema,
            idx,
            field.origin,
            items as unknown as ReadonlyArray<ListItem<S>>,
            commit as unknown as (next: ReadonlyArray<ListItem<S>>) => void,
          )
          return (
            <ItemCard
              key={item._id}
              index={idx}
              total={items.length}
              item={item}
              wrappedItem={wrapped}
              listFieldPath={field.origin.fieldPath}
              renderItem={renderItem}
              onEdit={hasModalEligibleFields ? () => openEdit(idx) : undefined}
              onRemove={() => removeItem(idx)}
              onMoveUp={() => moveItem(idx, idx - 1)}
              onMoveDown={() => moveItem(idx, idx + 1)}
              canRemove={canRemove}
            />
          )
        })}
        <AddItemCard onClick={openAdd} disabled={!canAdd} itemCount={items.length} />
      </div>
      {modal.mode === 'edit' ? (
        <Modal
          open
          onClose={handleModalCancel}
          title={<h2 style={MODAL_TITLE_STYLE}>Edit item fields</h2>}
          // ItemFormEditor can grow tall; give the form room.
          maxWidth={720}
          // Opened from the preview overlay (PreviewToolbar z-index 99999),
          // so the modal must be above it.
          zIndex={100000}
          ariaLabel="Edit item fields"
          footer={
            <>
              <button
                type="button"
                onClick={handleModalCancel}
                style={MODAL_SECONDARY_BUTTON_STYLE}
                data-agntcms-list-modal-cancel=""
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModalSave}
                style={MODAL_PRIMARY_BUTTON_STYLE}
                data-agntcms-list-modal-save=""
              >
                Save
              </button>
            </>
          }
        >
          <ItemFormEditor
            schema={itemSchema}
            value={modal.draft}
            onChange={handleDraftChange}
            // ✎ from the list overlay edits ONLY meta/non-inline fields
            // — visible content is edited on the rendered card itself
            // via the wrapped SlotItem. Without this filter, fields
            // like a heading or image would be reachable through both
            // paths and editors would not know which to trust.
            inlineEditableHidden
          />
        </Modal>
      ) : null}
    </>
  )
}

const MODAL_TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--agntcms-admin-fg)',
}

const MODAL_PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  background: 'var(--agntcms-admin-accent)',
  color: 'var(--agntcms-admin-surface)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
}

const MODAL_SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  background: 'var(--agntcms-admin-surface-raised)',
  color: 'var(--agntcms-admin-fg)',
  border: '1px solid var(--agntcms-admin-border)',
  borderRadius: 4,
  cursor: 'pointer',
}

// ---------------------------------------------------------------------------
// ItemCard — wraps a single rendered item with hover overlay affordances.
//
// The card itself shows the user's renderItem output (the same visual as
// published mode). The overlay is positioned absolutely so the card
// content is not displaced when affordances appear.
//
// Inline editing (always-inline model):
//   Every editable field inside the card is inline-editable in place,
//   via the wrapped fields on `wrappedItem`. There is NO modal entry
//   point on the card. Meta fields (boolean / select / link / etc.)
//   that the section author chooses not to surface inline cannot be
//   reached through the list overlay; if they need to be reachable,
//   the section author should render them in `renderItem` (any
//   Editable* widget) or expose them through the section's settings
//   modal (the ⚙ button on the section toolbar).
//
//   Inline saves are routed through a per-item `<SaveProvider>` that
//   inspects the field's path suffix (`features[0].title` → `title`)
//   and invokes the wrapped field's `onSave`. The wrapped field itself
//   computes the new full list and calls `commit(newList)` — so the
//   list-as-one-save-unit contract is preserved unchanged.
// ---------------------------------------------------------------------------

interface ItemCardProps<S extends SectionSchema> {
  readonly index: number
  readonly total: number
  // `item` is the raw item shape — wide `AnyItem` because section
  // components frequently declare their item array as
  // `ReadonlyArray<AnyListItem>`. The narrow, slot-typed projection is
  // on `wrappedItem`.
  readonly item: AnyItem
  readonly wrappedItem: SlotItem<S>
  // The list's own `origin.fieldPath` (no item index appended). Combined
  // with `index` it forms the `<list>[idx].` prefix that leaf saves use
  // for routing through `findWrappedFieldByPath`.
  readonly listFieldPath: string
  readonly renderItem: ((item: SlotItem<S>, index: number) => React.ReactNode) | undefined
  // `onEdit` is provided ONLY when the item schema has at least one
  // modal-eligible (meta/non-inline) field. When undefined, the ✎
  // button is suppressed — the item has nothing for the modal to show.
  readonly onEdit: (() => void) | undefined
  readonly onRemove: () => void
  readonly onMoveUp: () => void
  readonly onMoveDown: () => void
  readonly canRemove: boolean
}

const HOVER_STYLE_TAG = `
[data-agntcms-list-item]:hover:not(:has([data-agntcms-list-item]:hover, [data-agntcms-editable]:hover)) > [data-agntcms-list-overlay],
[data-agntcms-list-item]:focus-within:not(:has([data-agntcms-list-item]:focus-within, [data-agntcms-editable]:focus-within)) > [data-agntcms-list-overlay],
[data-agntcms-list-item]:hover:not(:has([data-agntcms-list-item]:hover, [data-agntcms-editable]:hover)) > [data-agntcms-list-delete],
[data-agntcms-list-item]:focus-within:not(:has([data-agntcms-list-item]:focus-within, [data-agntcms-editable]:focus-within)) > [data-agntcms-list-delete] {
  opacity: 1 !important;
}
[data-agntcms-list-item]:hover:not(:has([data-agntcms-list-item]:hover, [data-agntcms-editable]:hover)) {
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 2px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
[data-agntcms-list-add-card]:hover {
  background: var(--agntcms-admin-surface-raised);
  border-color: var(--agntcms-admin-accent);
  color: var(--agntcms-admin-fg);
  outline: 2px dashed var(--agntcms-admin-accent);
  outline-offset: 2px;
  box-shadow: var(--agntcms-admin-editable-halo);
}
`

function ItemCard<S extends SectionSchema>(props: ItemCardProps<S>): React.ReactElement {
  // `item` (the raw shape) is intentionally on `ItemCardProps` for future
  // affordances (duplicate, copy-id, etc.) but is not destructured here
  // — `wrappedItem` is what `renderItem` receives, and the per-item save
  // dispatcher routes through `wrappedItem`'s inline closures.
  const {
    index,
    total,
    wrappedItem,
    listFieldPath,
    renderItem,
    onEdit,
    onRemove,
    onMoveUp,
    onMoveDown,
    canRemove,
  } = props

  // Stop propagation defensively — the overlay buttons sit OVER the card
  // body, and inline-editable widgets inside the card may register their
  // own click handlers further up. Keeping `stopPropagation` on the
  // overlay buttons protects against future ambient handlers (a parent
  // `<SectionWrapper>`, an `EditableSelect` portal, etc.) from also
  // firing on a control click.
  const stop = (handler: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    handler()
  }

  // Per-item save dispatcher. Routes inline-edit saves from
  // `<EditableText>` / `<EditableRichText>` / `<EditableImage>` inside
  // the card to the wrapped field's `onSave` closure. The wrapped
  // field knows how to rebuild the full list and call `commit`.
  //
  // The leaf path can be:
  //   - `<list>[idx].title`                       (top-level inline)
  //   - `<list>[idx].features[j].label`           (nested-list inline,
  //                                                e.g. Pricing tiers ×
  //                                                features)
  //   - `<list>[idx].x[i].y[j].z[k].deep`         (3+ levels — same shape)
  //
  // We strip the canonical `<list>[idx].` prefix and let
  // `findWrappedFieldByPath` walk through the wrapped item to locate
  // the right inline-save closure. When the lookup yields nothing
  // (unwrapped kind, malformed path, or path mismatch) we silently
  // no-op — inline editing for those targets simply isn't available
  // for that field. The list overlay no longer provides any modal
  // escape hatch; meta fields must be reachable via `renderItem` or
  // the section settings modal.
  const itemSaveField: SaveFieldFn = useCallback(
    (origin, newValue) => {
      const relative = stripListItemPrefix(origin.fieldPath, listFieldPath, index)
      if (relative === undefined) return
      const found = findWrappedFieldByPath(wrappedItem as Record<string, unknown>, relative)
      if (found !== undefined) {
        found.onSave(newValue)
      }
    },
    [wrappedItem, listFieldPath, index],
  )

  return (
    <SaveProvider saveField={itemSaveField}>
      <div
        data-agntcms-list-item=""
        // Position relative so the absolutely-positioned overlay anchors
        // inside the card. NO outer onClick / cursor:pointer — every
        // editable field inside the card is inline-editable in place,
        // and there is no modal entry point on the card itself. The
        // dashed-teal hover outline on the whole card is kept
        // (HOVER_STYLE_TAG) — it tells the user this region has
        // overlay controls (move up/down, remove).
        style={{
          position: 'relative',
          borderRadius: 4,
        }}
      >
        {renderItem !== undefined ? (
          renderItem(wrappedItem, index)
        ) : (
          // Fallback when no renderItem is provided in preview mode. Shows
          // a minimal "Item N" placeholder so editing via the modal is
          // still possible.
          <div
            style={{
              padding: 16,
              background: 'var(--agntcms-admin-surface-raised)',
              border: '1px solid var(--agntcms-admin-border)',
              borderRadius: 4,
              color: 'var(--agntcms-admin-fg-muted)',
            }}
          >
            Item {index + 1}
          </div>
        )}
        <div
          data-agntcms-list-overlay=""
          // Overlay container holds ↑ ↓ in the top-right corner. The
          // destructive × button is rendered as a SIBLING (below) with
          // section-style circular treatment so deletion reads at the
          // same visual weight as section delete. The overlay is offset
          // to `right: 48` to leave a 32px circle + 8px gap of room for
          // the × button at `right: 8`. Offset is unchanged from the
          // earlier ✎-bearing layout: the pill's width follows its
          // contents and the geometry of the destructive sibling is
          // what fixes the offset.
          //
          // opacity: 0 by default; the hover style above flips it to 1.
          // focus-within keeps it visible while keyboard users navigate
          // among the buttons.
          style={{
            position: 'absolute',
            top: 8,
            right: 48,
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--agntcms-admin-surface)',
            border: '1px solid var(--agntcms-admin-border)',
            borderRadius: 4,
            opacity: 0,
            transition: 'opacity 100ms ease',
            zIndex: 1,
          }}
        >
          {onEdit !== undefined ? (
            <button
              type="button"
              onClick={stop(onEdit)}
              aria-label="Edit fields"
              data-agntcms-list-edit=""
              style={overlayButtonStyle(false)}
            >
              {'✎'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={stop(onMoveUp)}
            disabled={index === 0}
            aria-label="Move item up"
            style={overlayButtonStyle(index === 0)}
          >
            {'↑'}
          </button>
          <button
            type="button"
            onClick={stop(onMoveDown)}
            disabled={index === total - 1}
            aria-label="Move item down"
            style={overlayButtonStyle(index === total - 1)}
          >
            {'↓'}
          </button>
        </div>
        {/* Destructive × button — rendered as a SIBLING of the grouped
            overlay, NOT inside it, so its visual weight matches
            SectionDeleteButton (large red circle in the top-right). The
            grouped overlay holds the non-destructive controls; pulling
            × out keeps the destructive action visually distinct and
            consistent with the section pattern. The style constant is
            duplicated inline (rather than imported from preview/) to
            preserve the one-way dependency from preview/ → editable/
            (preview/ owns SectionWrapper which already imports from
            editable/; the reverse import would create a cycle). */}
        <button
          type="button"
          onClick={stop(onRemove)}
          disabled={!canRemove}
          title="Remove item"
          aria-label="Remove item"
          data-agntcms-list-delete=""
          style={listItemDeleteStyle(!canRemove)}
        >
          {'×'}
        </button>
      </div>
    </SaveProvider>
  )
}

function overlayButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 4,
    border: '1px solid var(--agntcms-admin-border)',
    background: 'var(--agntcms-admin-surface-raised)',
    color: 'var(--agntcms-admin-fg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

// Mirrors `deleteButtonStyle` in `react/preview/SectionEditControls.tsx`.
// Duplicated inline rather than imported because preview/ already imports
// from editable/ (SectionWrapper renders Editable* components inside its
// children); a reverse import would create a cycle. A single style
// constant is the right size for inline duplication — extracting a
// shared module would be more ceremony than the value warrants.
//
// 32×32 circle, dark background, red glyph, hover-revealed via the
// `[data-agntcms-list-delete]` selector in HOVER_STYLE_TAG. Opacity
// transition matches the surrounding overlay's reveal behaviour.
function listItemDeleteStyle(disabled: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid var(--agntcms-admin-border)',
    background: 'var(--agntcms-admin-surface)',
    color: 'var(--agntcms-admin-danger)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: 0,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    transition: 'opacity 0.15s',
    // When disabled (we're at min), the hover-reveal still flips opacity
    // to 1 (so the user can see the affordance is unavailable), but we
    // dim the glyph and switch the cursor to communicate non-interactivity.
    ...(disabled ? { filter: 'grayscale(0.6)' } : {}),
  }
}

// ---------------------------------------------------------------------------
// AddItemCard — trailing placeholder rendered AFTER all items so the
// "create" affordance follows the same visual rhythm as the cards. We
// don't try to match the exact card geometry (the framework doesn't
// know whether the cards are tall, narrow, etc.) — we just provide a
// dashed-bordered tile that fits the parent grid cell.
// ---------------------------------------------------------------------------

interface AddItemCardProps {
  readonly onClick: () => void
  readonly disabled: boolean
  // The number of preceding items. Used purely as a dependency signal
  // for the height-matching effect: when items are added/removed the
  // parent re-renders, the count changes, and the effect re-resolves
  // `previousElementSibling` and rewires its `ResizeObserver`.
  readonly itemCount: number
}

function AddItemCard(props: AddItemCardProps): React.ReactElement {
  const { onClick, disabled, itemCount } = props
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null)

  // Why height matching: the placeholder is a sibling of ItemCards in
  // the user's parent container (typically a CSS grid). When it shares
  // a row with item cards, grid's `align-items: stretch` pulls it to
  // the row height — fine. When it lands ALONE in a new row (e.g. 4
  // items in a 3-column grid → placeholder in row 2), the row height
  // is driven solely by our content and the placeholder becomes a
  // stubby tile compared to the cards above. To keep visual rhythm we
  // measure the preceding item card and lift our `min-height` to match
  // it. We deliberately do NOT touch the parent's layout strategy —
  // the wrapper className is the section author's public contract.
  // When there is no preceding card (empty list), we set NO min-height
  // and let the button size itself to `padding + "+ Add item"`.
  useLayoutEffect(() => {
    const node = buttonRef.current
    if (node === null) {
      setMeasuredHeight(null)
      return
    }
    const prev = node.previousElementSibling
    // Items are wrapped in elements carrying `data-agntcms-list-item`
    // (the ItemCard root). Anything else is not a card we should mirror.
    if (!(prev instanceof HTMLElement) || prev.dataset.agntcmsListItem === undefined) {
      setMeasuredHeight(null)
      return
    }
    const target = prev
    const update = (): void => {
      setMeasuredHeight(target.getBoundingClientRect().height)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [itemCount])

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-agntcms-list-add-card=""
      style={{
        // Intentionally no width — the parent grid/flex sizes us. The
        // `minHeight` is dynamic: when there IS a preceding ItemCard we
        // mirror its height so the placeholder doesn't look like a stub
        // when it lands alone in a new grid row. When there isn't (empty
        // list, or first row is empty) we set no min-height at all and
        // let the button size itself to `padding + "+ Add item"`.
        ...(measuredHeight !== null ? { minHeight: measuredHeight } : {}),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'transparent',
        border: '2px dashed var(--agntcms-admin-border)',
        borderRadius: 8,
        color: 'var(--agntcms-admin-fg-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        font: 'inherit',
        fontWeight: 500,
        transition: 'background 100ms ease, border-color 100ms ease, color 100ms ease',
      }}
    >
      + Add item
    </button>
  )
}

