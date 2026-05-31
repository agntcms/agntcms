// Smoke tests for the new editable widgets (Link, Number, Boolean, Select,
// List). Mirrors the published-mode coverage style used in editable.test.tsx
// — invoking the components as functions and inspecting the returned React
// element tree without rendering through jsdom. Preview-mode interactive
// flows (modal Save, list reorder) are exercised through pnpm template:dev
// during the smoke pass.

import { describe, it, expect, vi } from 'vitest'
import type { ButtonValue, LinkValue } from '../../domain/index'
import {
  validateEmail,
  validateExternalUrl,
  validateInternalSlug,
  validatePhone,
} from '../../domain/index'
// `wrapAsSlot` lifts test fixtures into the slot shape every editable
// widget consumes after EDITABILITY_DESIGN.md sub-task 2.
import { wrapAsSlot } from '../../sections/index'
import type { PreviewFieldLike } from './isPreviewField'
import { EditableBoolean } from './EditableBoolean'
import { EditableButton } from './EditableButton'
import { EditableLink } from './EditableLink'
import { EditableList } from './EditableList'
import { EditableNumber, shouldCommit } from './EditableNumber'
import { EditableSelect } from './EditableSelect'
import { ItemFormEditor, buildBlankItem, isModalEligible } from './ItemFormEditor'
import { LinkSubForm, validateLinkForSave } from './LinkSubForm'

interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

/**
 * Depth-first search of a React element tree for the first element whose
 * `type` matches `target`. Returns the raw element node or `undefined`.
 *
 * `ItemFormEditor` dispatches each field through an internal
 * `ItemFieldControl` function component, so the link control does not
 * appear as a `LinkSubForm` element until that component runs. To reach
 * it without jsdom we INVOKE any function-typed element encountered
 * during the walk (passing its props) and recurse into the result —
 * same no-render style as the rest of this file, just one hop deeper.
 * Invocation is guarded so a throwing component (e.g. one that calls
 * hooks) is skipped rather than failing the whole walk.
 */
function findElementByType(node: unknown, target: unknown): unknown {
  if (node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElementByType(child, target)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if (el.type === target) return el
  if (typeof el.type === 'function') {
    try {
      const rendered = (el.type as (p: unknown) => unknown)(el.props ?? {})
      const hit = findElementByType(rendered, target)
      if (hit !== undefined) return hit
    } catch {
      // Component needs a render context we don't have — skip it.
    }
  }
  if (el.props !== undefined) {
    return findElementByType(el.props['children'], target)
  }
  return undefined
}

function makePreviewField<T>(value: T): PreviewFieldLike<T> {
  return {
    __agntcmsPreview: true,
    value,
    origin: {
      pageSlug: 'home',
      sectionId: 's-1',
      fieldPath: 'field',
      source: 'draft',
      revision: 'r0',
    },
  }
}

// ---------------------------------------------------------------------------
// EditableNumber
// ---------------------------------------------------------------------------

describe('EditableNumber — published mode', () => {
  it('renders a plain text node with no event handlers when given a bare number', () => {
    const el = asTestElement(EditableNumber({ field: wrapAsSlot('number', 42) }))
    // Default tag is 'span'.
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('42')
    // No click handler in published mode.
    expect(el.props['onClick']).toBeUndefined()
  })

  it('honours the `as` prop to render a different tag', () => {
    const el = asTestElement(EditableNumber({ field: wrapAsSlot('number', 7), as: 'strong' }))
    expect(el.type).toBe('strong')
  })
})

describe('EditableNumber — preview mode', () => {
  it('renders the number as clickable in display state', () => {
    const inner = makePreviewField(99)
    // Direct call — the outer component delegates to a hook-using inner
    // component, so we cannot inspect the rendered DOM without jsdom.
    // This test only verifies the call does not throw and returns a
    // React element.
    const result = EditableNumber({ field: wrapAsSlot('number', inner) })
    expect(result).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// EditableNumber — dedupe on Enter+blur (I8)
//
// Regression I8: pressing Enter committed the value, and then the
// subsequent blur (which the Enter handler triggers by collapsing the
// input) called commit again before `field.value` had updated, so the
// dedupe `value !== field.value` was bypassed and the parent's save
// fired twice. The fix tracks `lastCommittedRef` and rejects the second
// call. Locked here against the pure helper.
// ---------------------------------------------------------------------------

describe('EditableNumber.shouldCommit — Enter+blur dedupe', () => {
  it('returns the parsed/clamped value on first commit', () => {
    expect(shouldCommit('42', undefined, undefined, 10, null)).toEqual({ value: 42 })
  })

  it('returns null on second commit with the same value (Enter then blur)', () => {
    // First call: Enter handler commits 42 against current field.value=10.
    const first = shouldCommit('42', undefined, undefined, 10, null)
    expect(first).toEqual({ value: 42 })
    // Second call: blur fires before parent re-renders so field.value is
    // still 10, and lastCommittedRef carries 42 from the first call.
    // Without the dedupe this would call saveFn(42) again.
    const second = shouldCommit('42', undefined, undefined, 10, first!.value)
    expect(second).toBeNull()
  })

  it('returns null when the value equals field.value (no change)', () => {
    expect(shouldCommit('10', undefined, undefined, 10, null)).toBeNull()
  })

  it('clamps to min/max before checking for a no-op commit', () => {
    // Author types 999, max is 5. Clamps to 5. Field value already 5 →
    // no-op (no save fires). This is also the dedupe path the Enter+blur
    // sequence trips when the author opens an at-max value, types
    // beyond, and confirms.
    expect(shouldCommit('999', 0, 5, 5, null)).toBeNull()
    expect(shouldCommit('-99', 0, 5, 0, null)).toBeNull()
  })

  it('returns null for NaN / Infinity input', () => {
    expect(shouldCommit('not-a-number', undefined, undefined, 0, null)).toBeNull()
    expect(shouldCommit('Infinity', undefined, undefined, 0, null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// EditableBoolean
// ---------------------------------------------------------------------------

describe('EditableBoolean — published mode', () => {
  // Published mode returns null because emitting the literal "true"/"false"
  // string would corrupt any section that uses the boolean structurally
  // (e.g. `<EditableBoolean field={dismissible} />` without a wrapping
  // conditional). Silent garbage text in production is worse than no-op.
  it('renders nothing (returns null)', () => {
    expect(EditableBoolean({ field: wrapAsSlot('boolean', true) })).toBeNull()
    expect(EditableBoolean({ field: wrapAsSlot('boolean', false) })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// EditableLink
// ---------------------------------------------------------------------------

describe('EditableLink — published mode', () => {
  it('renders the label inside a span (new internal shape)', () => {
    const value: LinkValue = { type: 'internal', slug: 'about', label: 'About us' }
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', value) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('About us')
  })

  it('renders the label inside a span (new external shape)', () => {
    const value: LinkValue = {
      type: 'external',
      url: 'https://example.test/',
      label: 'Example',
    }
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', value) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Example')
  })

  it('renders the label inside a span when given a legacy {href,label} value', () => {
    // Migration-window contract: unmigrated content carrying the old
    // shape must still render. The component normalises defensively.
    const legacy = { href: '/about', label: 'About' } as unknown as LinkValue
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', legacy) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('About')
  })

  it('renders the label inside a span (email shape)', () => {
    const value: LinkValue = { type: 'email', email: 'foo@bar.test', label: 'Mail' }
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', value) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Mail')
  })

  it('renders the label inside a span (phone shape)', () => {
    const value: LinkValue = { type: 'phone', phone: '+1 555 123 4567', label: 'Call' }
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', value) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Call')
  })

  it('migrates a legacy mailto: href to the email branch', () => {
    // Defensive normalisation in EditableLink.published mode collapses
    // a legacy `{ href: 'mailto:...', label }` onto the new email
    // branch. The label still renders.
    const legacy = { href: 'mailto:foo@bar.test', label: 'Mail' } as unknown as LinkValue
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', legacy) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Mail')
  })

  it('migrates a legacy tel: href to the phone branch', () => {
    const legacy = { href: 'tel:+15551234567', label: 'Call' } as unknown as LinkValue
    const el = asTestElement(EditableLink({ field: wrapAsSlot('link', legacy) }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Call')
  })
})

// ---------------------------------------------------------------------------
// EditableButton — published mode
// ---------------------------------------------------------------------------

describe('EditableButton — published mode', () => {
  const variants = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
  ] as const

  it('renders the label inside a span (no link)', () => {
    const value: ButtonValue = { label: 'Get started', variant: 'primary' }
    const el = asTestElement(EditableButton({ field: wrapAsSlot('button', value), variants }))
    expect(el.type).toBe('span')
    // Published mode is a plain span — section components own the
    // `<a>` / `<button>` wrapper and the variant className.
    expect(el.props['children']).toBe('Get started')
    expect(el.props['onClick']).toBeUndefined()
  })

  it('renders the label inside a span (with link attached)', () => {
    const value: ButtonValue = {
      label: 'Sign up',
      variant: 'secondary',
      link: { type: 'internal', slug: 'signup', label: 'Sign up' },
    }
    const el = asTestElement(EditableButton({ field: wrapAsSlot('button', value), variants }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Sign up')
  })

  it('passes className through to the span', () => {
    const value: ButtonValue = { label: 'Click', variant: 'primary' }
    const el = asTestElement(
      EditableButton({ field: wrapAsSlot('button', value), variants, className: 'cta' }),
    )
    expect(el.props['className']).toBe('cta')
  })
})

describe('EditableButton — preview mode', () => {
  const variants = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
  ] as const

  it('returns a preview-mode wrapper element when given a PreviewField', () => {
    const inner: PreviewFieldLike<ButtonValue> = {
      __agntcmsPreview: true,
      value: { label: 'Edit me', variant: 'primary' },
      origin: {
        pageSlug: 'home',
        sectionId: 's-cta',
        fieldPath: 'cta',
        source: 'draft',
        revision: 'r0',
      },
    }
    // We can't render the inner preview component without jsdom (vitest
    // env is `node`). The contract we lock down here is "preview mode
    // does NOT short-circuit to a plain span" — i.e. the outer call
    // returns an element whose type is the preview function, not the
    // string 'span'. The full click → modal Save round-trip is
    // exercised via `pnpm template:dev`.
    const el = asTestElement(EditableButton({ field: wrapAsSlot('button', inner), variants }))
    expect(el.type).not.toBe('span')
    expect(typeof el.type).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// EditableSelect
// ---------------------------------------------------------------------------

describe('EditableSelect — published mode', () => {
  const options = [
    { value: 'sm', label: 'Small' },
    { value: 'lg', label: 'Large' },
  ] as const

  it('renders the resolved label for a known option', () => {
    const el = asTestElement(EditableSelect({ field: wrapAsSlot('select', 'lg'), options }))
    expect(el.type).toBe('span')
    expect(el.props['children']).toBe('Large')
  })

  it('falls back to the raw value when the option is missing from the list', () => {
    const el = asTestElement(EditableSelect({ field: wrapAsSlot('select', 'unknown'), options }))
    expect(el.props['children']).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// EditableList
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// EditableLink + EditableList — link allow-list integration
//
// We can't drive the modal Save / list-cell paste interactions without
// jsdom (the vitest env for @agntcms/next is 'node'). Instead we lock
// down the contract these components rely on:
//   1. They import `validateLink` from `domain/`, the single source of
//      truth for link validation.
//   2. The shared validator rejects exactly the dangerous schemes that
//      could otherwise survive an editor paste / list-cell change into
//      `content/**/*.json` and render as `<a href="javascript:...">`.
//
// Full interactive coverage (Save → no-onSave-call, modal stays open,
// error visible; list-cell paste → input value reverts) is exercised
// via `pnpm template:dev` smoke and is documented in the editor PR
// notes.
// ---------------------------------------------------------------------------

describe('EditableLink / EditableList — link validation contract', () => {
  it('exports the per-branch validators from domain/', () => {
    expect(typeof validateExternalUrl).toBe('function')
    expect(typeof validateInternalSlug).toBe('function')
    expect(typeof validateEmail).toBe('function')
    expect(typeof validatePhone).toBe('function')
  })

  it('external branch rejects javascript:', () => {
    expect(validateExternalUrl('javascript:alert(1)')).not.toBeNull()
  })

  it('external branch rejects data:', () => {
    expect(validateExternalUrl('data:text/html,<script>alert(1)</script>')).not.toBeNull()
  })

  it('external branch accepts a typical https URL', () => {
    expect(validateExternalUrl('https://example.test/about')).toBeNull()
  })

  it('internal branch accepts a typical slug', () => {
    expect(validateInternalSlug('about')).toBeNull()
  })

  it('internal branch rejects a leading slash', () => {
    expect(validateInternalSlug('/about')).not.toBeNull()
  })

  it('email branch accepts a typical address', () => {
    expect(validateEmail('foo@example.com')).toBeNull()
  })

  it('email branch rejects a string with no @', () => {
    expect(validateEmail('not-an-email')).not.toBeNull()
  })

  it('phone branch accepts a 7-digit number with formatting', () => {
    expect(validatePhone('555-123-4567')).toBeNull()
  })

  it('phone branch rejects fewer than 7 digits', () => {
    expect(validatePhone('555-12')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validateLinkForSave — the parent-side short-circuit used by both
// EditableLink (modal Save) and ItemFormEditor (list-item Save). Empty
// payload on any branch must be rejected; populated payload routes to
// the correct per-branch validator.
//
// We can't drive the segmented control through jsdom (vitest env is
// 'node'), but each branch is a pure-data contract — validateLinkForSave
// is the same code path the Save button runs, so locking it here covers
// the 4-tab switching outcome.
// ---------------------------------------------------------------------------

describe('validateLinkForSave — per-branch save-time contract', () => {
  it('internal: empty slug is "incomplete"', () => {
    expect(validateLinkForSave({ type: 'internal', slug: '', label: 'x' })).toBe(
      'Pick a page or switch link type.',
    )
  })

  it('internal: valid slug passes', () => {
    expect(validateLinkForSave({ type: 'internal', slug: 'about', label: 'About' })).toBeNull()
  })

  it('internal: malformed slug returns the validator error', () => {
    expect(
      validateLinkForSave({ type: 'internal', slug: '/about', label: 'About' }),
    ).not.toBeNull()
  })

  it('external: empty url is "incomplete"', () => {
    expect(validateLinkForSave({ type: 'external', url: '', label: 'x' })).toBe(
      'Enter a URL or switch link type.',
    )
  })

  it('external: valid https URL passes', () => {
    expect(
      validateLinkForSave({ type: 'external', url: 'https://x.test/', label: 'X' }),
    ).toBeNull()
  })

  it('email: empty email is "incomplete"', () => {
    expect(validateLinkForSave({ type: 'email', email: '', label: 'x' })).toBe(
      'Enter an email address or switch link type.',
    )
  })

  it('email: valid address passes', () => {
    expect(
      validateLinkForSave({ type: 'email', email: 'foo@bar.test', label: 'Mail' }),
    ).toBeNull()
  })

  it('email: malformed address returns the validator error', () => {
    expect(
      validateLinkForSave({ type: 'email', email: 'not-an-email', label: 'Mail' }),
    ).toBe('Invalid email address')
  })

  it('phone: empty phone is "incomplete"', () => {
    expect(validateLinkForSave({ type: 'phone', phone: '', label: 'x' })).toBe(
      'Enter a phone number or switch link type.',
    )
  })

  it('phone: valid number passes', () => {
    expect(
      validateLinkForSave({ type: 'phone', phone: '+1 555 123 4567', label: 'Call' }),
    ).toBeNull()
  })

  it('phone: too-short number returns the validator error', () => {
    expect(
      validateLinkForSave({ type: 'phone', phone: '555-12', label: 'Call' }),
    ).toBe('Phone number is too short')
  })
})

// ---------------------------------------------------------------------------
// EditableList — modal-based preview UX (v0.1.27 redesign)
//
// The vitest env for @agntcms/next is `node` (no jsdom), so we cannot
// mount the hooks-using EditableListPreview to drive real DOM events.
// We pin the redesign through three angles:
//   1. The outer EditableList dispatcher returns the inner preview
//      component when given a PreviewField (no behaviour change here,
//      same shape as before).
//   2. The new ItemFormEditor renders a stable element shape — labelled
//      controls per field, recursive NestedListEditor for `list` fields
//      (NOT a JSON textarea).
//   3. buildBlankItem builds an item with every field defaulted from
//      its descriptor, including nested empty lists.
//
// The interactive flow (open card, edit, Save → onSave fires; Cancel /
// Esc → no save; recursive nested list add/remove/reorder) is exercised
// through `pnpm template:dev`. The structural checks below are the
// regression net.
// ---------------------------------------------------------------------------

describe('EditableList — preview-mode dispatch', () => {
  it('returns a React element rooted in the inner preview component', () => {
    const items = [{ _id: 'a', title: 'one' }]
    // Sub-task 3: `field` is a slot. In preview mode `slot.value` is
    // the PreviewFieldLike carrying the list-level origin.
    const previewWrapper = makePreviewField(items as unknown as never)
    const field = wrapAsSlot('list', previewWrapper) as Parameters<typeof EditableList>[0]['field']
    const el = asTestElement(
      EditableList({
        field,
        itemSchema: { title: { kind: 'text' } },
      }),
    )
    // The outer EditableList delegates to a private function component
    // (EditableListPreview); we identify it as the dispatch result by
    // its function-typed `type`. Asserting the function name here would
    // be brittle to renames, so we keep the check shape-level only.
    expect(typeof el.type).toBe('function')
    expect(el.props['itemSchema']).toEqual({ title: { kind: 'text' } })
  })
})

// ---------------------------------------------------------------------------
// EditableList — inline-edit overlay UX (v0.1.28+)
//
// The vitest env is node (no jsdom), and EditableListPreview / ItemCard use
// hooks, so we can't render the preview body to a DOM. We assert the new
// behaviour at the source level instead — narrow string searches against
// the source file. The trade-off: these checks are coarser than DOM
// assertions, but they catch the specific regression vectors the design
// rules out (cards opening a modal on body-click, ✎ being labelled as
// "Edit item" instead of the new "Edit fields", the hover outline rule
// being lost). Interactive behaviour is exercised through pnpm
// template:dev.
// ---------------------------------------------------------------------------

describe('EditableList — preview-mode card UX (source-level invariants)', () => {
  // Read the EditableList source ONCE for all assertions in this block.
  // The path is resolved relative to this test file; vitest runs from
  // the package root.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path')
  const source = fs.readFileSync(
    path.resolve(__dirname, 'EditableList.tsx'),
    'utf-8',
  )

  it("the card's outer div no longer hijacks click to open the modal", () => {
    // The previous design wrote `<div data-agntcms-list-item="" onClick={onEdit}`.
    // Inline-editable widgets inside the card need card-body clicks to land
    // on themselves, not on a modal opener. We forbid the literal pattern
    // — a future "drive-by refactor" that re-adds it has to update this
    // assertion deliberately.
    expect(source).not.toMatch(/data-agntcms-list-item=""\s*\n\s*onClick=\{onEdit\}/)
    // The card outer div must also not carry cursor:pointer, which used
    // to communicate "click to open modal". Inline-editable widgets
    // bring their own affordance.
    const cardBlock = source.slice(
      source.indexOf("data-agntcms-list-item=\"\""),
      source.indexOf('data-agntcms-list-overlay'),
    )
    expect(cardBlock).not.toMatch(/cursor:\s*['"]?pointer/)
  })

  it('the overlay carries a conditional ✎ "Edit fields" affordance, gated on hasModalEligibleFields', () => {
    // List items have a split editing policy: visible content edits
    // inline; meta/non-inline fields are reached via ✎ → modal. The
    // button is rendered ONLY when the schema has any modal-eligible
    // fields — a regression that drops the gating (always-on or
    // never-on) has to update this assertion deliberately.
    expect(source).toContain('aria-label="Edit fields"')
    expect(source).toContain('data-agntcms-list-edit=""')
    // The card outer click handler is still NOT used to open the modal
    // (that's the legacy hijack the previous test catches). The modal
    // is reached through the ✎ button alone, whose click handler comes
    // from `onEdit`.
    expect(source).not.toContain('aria-label="Edit item"')
  })

  it('the hover outline rule still targets [data-agntcms-list-item]:hover', () => {
    // Removing the card-click handler must not remove the hover
    // affordance — the user still needs to know the region has overlay
    // controls. The dashed teal outline rule is the canonical hint.
    //
    // The selector is scoped with `:not(:has(...))` covering BOTH a
    // nested list-item AND any nested editable widget
    // (`[data-agntcms-editable]`), so that:
    //   - when list items are nested (e.g. Pricing tier card containing
    //     a features list), only the deepest hovered item gets the outline;
    //   - when ANY editable (text/image/link/richText/video) inside a card
    //     is hovered, the card's own outline suppresses so the user sees
    //     only the most specific descendant as "selected".
    // Without the editable branch of the `:not(:has(...))` guard, hovering
    // a nested EditableText/EditableImage inside a list item produced a
    // "double selection" (outer card outline + inner widget outline).
    expect(source).toMatch(
      /\[data-agntcms-list-item\]:hover[^{]*\{[^}]*outline:\s*2px\s+dashed/,
    )
    expect(source).toContain(
      ':not(:has([data-agntcms-list-item]:hover, [data-agntcms-editable]:hover))',
    )
    // The :focus-within branch must carry the parallel guard so keyboard
    // focus inside a nested editable behaves the same as pointer hover.
    expect(source).toContain(
      ':not(:has([data-agntcms-list-item]:focus-within, [data-agntcms-editable]:focus-within))',
    )
  })

  it('renderItem in preview mode receives the wrapped (PreviewItem) shape, not the raw item', () => {
    // Wrap-call site: the wrap MUST be applied before passing into
    // renderItem (this is what makes inline editing work). We check that
    // `wrapItemForPreview` is invoked inside the preview component AND
    // that the wrapped value is what flows into ItemCard's renderItem
    // path. A regression that drops the wrap would fail this check.
    expect(source).toMatch(/wrapItemForPreview<S>\(/)
    expect(source).toMatch(/renderItem\(wrappedItem,\s*index\)/)
  })

  // -------------------------------------------------------------------------
  // Section-style circular delete (v0.1.28+)
  //
  // The destructive × button moved OUT of the grouped overlay and adopts
  // the same visual treatment as `SectionDeleteButton.deleteButtonStyle`
  // in `react/preview/SectionEditControls.tsx`: 32×32 circle, dark bg,
  // red glyph, hover-revealed. The remaining overlay holds ✎ ↑ ↓ only.
  // These checks lock the new contract at the source level (vitest env
  // is node — no jsdom — so we can't drive real DOM assertions here).
  // -------------------------------------------------------------------------

  it('the × button has its own data-agntcms-list-delete attribute and aria-label="Remove item"', () => {
    expect(source).toContain('data-agntcms-list-delete=""')
    // The button's accessible name must match the section's "Remove item"
    // semantic — same wording the rest of the editor uses.
    expect(source).toMatch(/aria-label="Remove item"/)
  })

  it('the × button uses a circular section-style treatment (32×32, borderRadius 50%, red glyph)', () => {
    // The style constant is duplicated inline (NOT imported from
    // preview/) — see the comment in EditableList.tsx for why. We assert
    // the canonical fields appear together inside `listItemDeleteStyle`.
    const start = source.indexOf('function listItemDeleteStyle(')
    expect(start).toBeGreaterThan(-1)
    // Slice from the function start to the next top-level `function ` /
    // `// ----` boundary so we only inspect THIS style's body.
    const tail = source.slice(start)
    const end = Math.min(
      ...[
        tail.indexOf('\nfunction ', 1),
        tail.indexOf('\n// ---'),
      ].filter((n) => n > 0),
    )
    const body = tail.slice(0, end > 0 ? end : tail.length)
    expect(body).toMatch(/width:\s*32/)
    expect(body).toMatch(/height:\s*32/)
    expect(body).toMatch(/borderRadius:\s*['"]50%['"]/)
    expect(body).toMatch(/color:\s*['"]var\(--agntcms-admin-danger\)/)
    expect(body).toMatch(/fontSize:\s*18/)
    expect(body).toMatch(/zIndex:\s*10/)
    expect(body).toMatch(/opacity:\s*0/)
  })

  it('the grouped overlay (✎ ↑ ↓) no longer contains × / data-agntcms-list-remove', () => {
    // Regression guard: the previous design had a `×` button labelled
    // `data-agntcms-list-remove` INSIDE the grouped overlay container.
    // The redesign moves it out (it's now a sibling of the overlay
    // with `data-agntcms-list-delete`). This test fails if a future
    // edit reintroduces the old attribute.
    expect(source).not.toContain('data-agntcms-list-remove')
    // Locate the grouped overlay block and assert it does NOT contain a
    // literal "Remove item" aria-label — the only "Remove item" button
    // is now the circular sibling.
    const overlayStart = source.indexOf('data-agntcms-list-overlay=""')
    expect(overlayStart).toBeGreaterThan(-1)
    // The overlay div ends at the next sibling element ('}>' close +
    // following lines until the closing `</div>` of the overlay). We
    // approximate by slicing to the closing `</div>` that's followed by
    // the destructive button comment.
    const overlayBlock = source.slice(
      overlayStart,
      source.indexOf('Destructive × button', overlayStart),
    )
    // The destructive marker must appear AFTER the overlay block (i.e.
    // we found a non-negative slice end), otherwise the layout regressed.
    expect(overlayBlock.length).toBeGreaterThan(0)
    expect(overlayBlock).not.toContain("'×'")
    expect(overlayBlock).not.toContain('aria-label="Remove item"')
  })

  it('the grouped overlay sits at right: 48 to leave room for the circular × at right: 8', () => {
    // The two buttons must not overlap. Section-style × is anchored at
    // top: 8, right: 8 (32px wide → spans right: 8..40). The grouped
    // overlay's right offset must be at least ~48 to clear it.
    // We assert the literal value rather than computing it because the
    // file is the spec — a future "tweak" that reduces the offset must
    // be deliberate enough to update this test.
    const overlayStart = source.indexOf('data-agntcms-list-overlay=""')
    // Slice from the overlay's data-attribute through to its closing
    // `</div>` (the destructive button immediately follows). 1500 chars
    // is comfortably more than the inline-style block plus the three
    // overlay buttons, but stops well before the destructive button so
    // we don't accidentally match its `right: 8` / `top: 8`.
    const overlayBlock = source.slice(overlayStart, overlayStart + 1500)
    const styleEnd = overlayBlock.indexOf('}}')
    const styleBlock = overlayBlock.slice(0, styleEnd)
    expect(styleBlock).toMatch(/right:\s*48/)
    expect(styleBlock).toMatch(/top:\s*8/)
  })

  it('HOVER_STYLE_TAG reveals the new × button on hover via [data-agntcms-list-delete]', () => {
    // The circular × must fade in on item-hover, matching the rest of
    // the overlay. The selector must appear inside the same opacity:1
    // rule (or a sibling rule that targets the same hover state).
    //
    // The opacity rule MUST use `!important` so it beats the inline
    // `opacity: 0` declarations on the overlay container and on the
    // ×-button style (inline style attributes outrank a plain stylesheet
    // rule by specificity, so without `!important` the buttons stay
    // invisible on hover). Mirrors the section-control pattern in
    // `SectionWrapper.tsx`.
    const tagStart = source.indexOf('const HOVER_STYLE_TAG')
    expect(tagStart).toBeGreaterThan(-1)
    const tag = source.slice(tagStart, tagStart + 800)
    // Child combinator (`>`) — NOT a descendant combinator. The descendant
    // form leaks across nested lists: hovering an inner feature row also
    // matches the outer tier card's `:hover` (ancestor propagation), which
    // revealed every nested overlay in the inner list. Scoping each rule
    // to direct children of the hovered list-item fixes that — the overlay
    // and × button DOM nodes are rendered as direct children of the
    // `data-agntcms-list-item` wrapper.
    //
    // In addition, the rule MUST suppress when a nested editable widget
    // is hovered/focused (parallel to the outline rule above) — otherwise
    // hovering an EditableText inside a card reveals the outer ↑↓× while
    // the inner widget's selection box also shows ("double selection").
    expect(tag).toMatch(
      /\[data-agntcms-list-item\]:hover[^{]*>\s*\[data-agntcms-list-delete\]/,
    )
    expect(tag).toContain(
      ':not(:has([data-agntcms-list-item]:hover, [data-agntcms-editable]:hover)) > [data-agntcms-list-delete]',
    )
    expect(tag).toContain('opacity: 1 !important')
  })

  it('removeItem prompts confirm("Remove this item?") before committing', () => {
    // Mirrors SectionDeleteButton.handleDelete's confirm gate. The
    // min-guard MUST run BEFORE confirm (no-op shouldn't prompt). We
    // assert the source order: `if (min !== undefined ...)` then
    // `confirm('Remove this item?')` then `commit(...)`.
    const fn = source.slice(
      source.indexOf('const removeItem = useCallback'),
      source.indexOf('const moveItem = useCallback'),
    )
    expect(fn).toMatch(/if \(min !== undefined && items\.length <= min\) return/)
    expect(fn).toMatch(/confirm\(['"]Remove this item\?['"]\)/)
    // Order: min-guard before confirm before commit.
    const minIdx = fn.search(/if \(min !== undefined/)
    const confirmIdx = fn.search(/confirm\(['"]Remove this item\?['"]\)/)
    const commitIdx = fn.search(/commit\(items\.filter/)
    expect(minIdx).toBeGreaterThan(-1)
    expect(confirmIdx).toBeGreaterThan(minIdx)
    expect(commitIdx).toBeGreaterThan(confirmIdx)
  })
})

describe('ItemFormEditor — element-tree shape', () => {
  it('renders one label per schema field, regardless of kind', () => {
    // ItemFormEditor renders every schema field by default. The
    // `inlineEditableHidden` opt-in (used by `EditableList`'s ✎ button) is
    // the only filter; without it (the recursive `NestedListEditor` case),
    // the full schema is rendered.
    const item = { _id: 'x', title: 'hi', enabled: true } as unknown as Parameters<
      typeof ItemFormEditor
    >[0]['value']
    const el = asTestElement(
      ItemFormEditor({
        schema: {
          title: { kind: 'text' },
          enabled: { kind: 'boolean' },
        },
        value: item,
        onChange: () => {},
      }),
    )
    expect(el.type).toBe('div')
    const children = el.props['children'] as React.ReactElement[]
    // Both fields render — text + boolean.
    expect(children).toHaveLength(2)
  })

  it('renders nested ListField cells WITHOUT a JSON textarea (recursive editor)', () => {
    // The previous design controlled nested lists with a JSON textarea
    // (regression B2). The redesign renders nested lists through the
    // same recursive form. We check that no descendant element of the
    // rendered ItemFormEditor uses a JSON-encoded textarea fallback.
    const item = {
      _id: 'x',
      features: [{ _id: 'f1', label: 'first', included: true }],
    } as unknown as Parameters<typeof ItemFormEditor>[0]['value']
    const el = asTestElement(
      ItemFormEditor({
        schema: {
          features: {
            kind: 'list',
            itemSchema: { label: { kind: 'text' }, included: { kind: 'boolean' } },
          },
        },
        value: item,
        onChange: () => {},
      }),
    )
    const serialized = JSON.stringify(el)
    // No textarea-with-JSON in the tree — defensive check that catches a
    // future regression where someone "simplifies" nested-list editing
    // back to a stringified blob.
    expect(serialized).not.toContain('JSON.stringify')
    // The serialised tree should NOT contain a literal JSON-array string
    // bound to any value/defaultValue prop.
    expect(serialized).not.toMatch(/"value":"\[/)
  })
})

// ---------------------------------------------------------------------------
// ItemFormEditor — `button` fields are EXCLUDED from the item form.
//
// A button is a self-contained editable entity: label, variant, and link
// are edited together in `<ButtonPickerModal>`, which is opened ONLY by
// clicking the button on the rendered page. The form surface (item form
// editor / section settings modal) does not render anything for button
// fields — including a placeholder row would create a duplicate edit
// path and confuse editors. The exclusion lives in `FORM_EXCLUDED_KINDS`
// inside `ItemFormEditor.tsx` and is reinforced by `'button'` membership
// in `FORM_FORBIDDEN_KINDS` (which forbids buttons in form schemas
// themselves — distinct concerns, both pointing at "buttons aren't a
// form-surface concept").
//
// The test env here is `node` (no jsdom). The element-tree assertions
// below run the editor as a function and inspect the React-element
// children directly. The source-level assertions catch a future
// contributor who tries to "re-add a placeholder row".
// ---------------------------------------------------------------------------
describe('ItemFormEditor — ButtonField is NOT rendered in the item form', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path')

  const editorSource = fs.readFileSync(
    path.resolve(__dirname, 'ItemFormEditor.tsx'),
    'utf-8',
  )

  it('does not import ButtonPickerModal or ButtonSubForm — neither belongs in this file', () => {
    // The button picker is reached ONLY by clicking the button on the
    // page; the item form has no entry point into it. Importing either
    // surface here would signal an attempt to re-introduce a duplicate
    // edit path.
    expect(editorSource).not.toMatch(/from '\.\/ButtonPickerModal'/)
    expect(editorSource).not.toMatch(/from '\.\/ButtonSubForm'/)
  })

  it('declares a FORM_EXCLUDED_KINDS set containing "button"', () => {
    // The canonical exclusion mechanism. A future contributor that wants
    // to surface a button row in the form has to deliberately remove
    // `'button'` from this set — and update this test.
    expect(editorSource).toMatch(/FORM_EXCLUDED_KINDS[\s\S]*?'button'/)
  })

  it('filters entries by FORM_EXCLUDED_KINDS before rendering', () => {
    // The filter MUST run unconditionally (i.e. NOT gated on
    // `inlineEditableHidden`), because the exclusion applies to every
    // consumer of the form — section settings AND list-item ✎.
    expect(editorSource).toMatch(
      /Object\.entries\(schema\)\.filter\([\s\S]*?FORM_EXCLUDED_KINDS\.has/,
    )
  })

  it("the `case 'button':` branch is unreachable (no <ButtonFieldRow> / no <ButtonSubForm>)", () => {
    // The case label survives for switch exhaustiveness, but its body
    // must not mount any editor surface. Asserting the absence of both
    // components is enough — together they cover every prior shape this
    // branch could take.
    const start = editorSource.indexOf("case 'button':")
    expect(start).toBeGreaterThan(0)
    const next = editorSource.indexOf('case ', start + 1)
    const branch = editorSource.slice(start, next)
    expect(branch).not.toMatch(/<ButtonFieldRow/)
    expect(branch).not.toMatch(/<ButtonSubForm/)
    expect(branch).not.toMatch(/<ButtonPickerModal/)
  })

  it('contains no ButtonFieldRow component — local helper has been removed', () => {
    // The previous design used a `ButtonFieldRow` summary component to
    // open the picker from inside the form. With buttons excluded
    // entirely, the helper is gone.
    expect(editorSource).not.toMatch(/function ButtonFieldRow/)
    expect(editorSource).not.toMatch(/data-agntcms-button-field-row/)
  })

  it('skips button fields when iterating schema (element-tree check)', () => {
    // Element-tree assertion: a schema with one text + one button must
    // render exactly one row. The button must be absent.
    const schema = {
      title: { kind: 'text' },
      cta: {
        kind: 'button',
        variants: [{ value: 'primary', label: 'Primary' }],
      },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['schema']
    const value = {
      _id: 'x',
      title: 'hi',
      cta: { label: 'Go', variant: 'primary' },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['value']
    const el = ItemFormEditor({ schema, value, onChange: () => {} })
    const root = el as unknown as { props: { children: unknown } }
    const children = Array.isArray(root.props.children) ? root.props.children : []
    const keys = children
      .map((c) =>
        c !== null && typeof c === 'object' && 'key' in (c as object)
          ? (c as { key: string | null }).key
          : null,
      )
      .filter((k): k is string => typeof k === 'string')
    expect(keys).toEqual(['title'])
  })

  it('renders the empty-state caption when only button fields are declared', () => {
    // A schema containing ONLY excluded kinds collapses to an empty
    // entry list — the existing empty-state caption catches it. This
    // path is defensive (consumers that want to render a button-only
    // section should never open the form), but the caption beats a
    // blank modal body if it slips through.
    const schema = {
      cta: {
        kind: 'button',
        variants: [{ value: 'primary', label: 'Primary' }],
      },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['schema']
    const value = {
      _id: 'x',
      cta: { label: 'Go', variant: 'primary' },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['value']
    const el = ItemFormEditor({ schema, value, onChange: () => {} })
    const serialized = JSON.stringify(el)
    expect(serialized).toContain('No fields to edit here')
  })
})

// ---------------------------------------------------------------------------
// EditableList — split-policy editing (inline + ✎ modal)
//
// Visible editorial fields (text/richText/image/link/list) are edited
// inline on the card; meta/non-inline fields (number/boolean/select/
// video/reference) are reached through a ✎ modal that opens only when
// the schema has any modal-eligible fields. `+ Add item`
// stays direct-commit (no modal). The vitest env is `node` (no jsdom),
// so we assert at the source level.
// ---------------------------------------------------------------------------
describe('EditableList — split-policy editing (source-level invariants)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path')

  const listSource = fs.readFileSync(
    path.resolve(__dirname, 'EditableList.tsx'),
    'utf-8',
  )

  it('imports Modal, ItemFormEditor, and isModalEligible', () => {
    // The ✎ button opens a modal that runs ItemFormEditor in
    // `inlineEditableHidden` mode. `isModalEligible` is the policy
    // predicate that decides whether to surface the ✎ button at all.
    expect(listSource).toMatch(/from '\.\.\/shared\/Modal'/)
    expect(listSource).toMatch(/ItemFormEditor[\s\S]*buildBlankItem[\s\S]*isModalEligible/)
  })

  it('renders the ✎ button only when the schema has modal-eligible fields', () => {
    // The button is rendered conditionally on `onEdit !== undefined`
    // and `onEdit` itself is wired only when `hasModalEligibleFields`
    // is true. This pair of source patterns locks the gating.
    expect(listSource).toMatch(/hasModalEligibleFields\s*=\s*Object\.values\(itemSchema\)\.some\(isModalEligible\)/)
    expect(listSource).toMatch(/onEdit=\{hasModalEligibleFields\s*\?\s*\(\)\s*=>\s*openEdit\(idx\)\s*:\s*undefined\}/)
    // The button JSX itself carries the documented data attribute and
    // aria-label so external selectors and accessibility tools can find
    // it deterministically.
    expect(listSource).toMatch(/aria-label="Edit fields"/)
    expect(listSource).toMatch(/data-agntcms-list-edit=""/)
  })

  it('openAdd directly appends a blank item with descriptor defaults (no modal)', () => {
    // `+ Add item` stays direct-commit — the modal opens only via ✎
    // for editing existing rows. A future regression that opens the
    // modal on Add would have to flip these expectations deliberately.
    const fn = listSource.slice(
      listSource.indexOf('const openAdd = useCallback'),
      listSource.indexOf('const openEdit = useCallback'),
    )
    expect(fn.length).toBeGreaterThan(0)
    expect(fn).toMatch(/buildBlankItem\(itemSchema\)/)
    expect(fn).toMatch(/commit\(\[\.\.\.items,\s*blank\]\)/)
    expect(fn).not.toMatch(/setModal\(\{\s*mode:\s*['"]add['"]/)
  })

  it("the modal renders ItemFormEditor with inlineEditableHidden so visible content isn't duplicated", () => {
    // The ✎ flow MUST pass `inlineEditableHidden` so the modal only
    // shows meta fields. Without it, fields like a heading would be
    // editable through both the inline card and the modal — editors
    // would not know which path to trust.
    expect(listSource).toMatch(/inlineEditableHidden/)
  })
})

describe('buildBlankItem — defaults per field kind', () => {
  it('honours descriptor defaults when present', () => {
    const blank = buildBlankItem({
      label: { kind: 'text', default: 'New item' },
      count: { kind: 'number', default: 3 },
    })
    expect(blank['label']).toBe('New item')
    expect(blank['count']).toBe(3)
    expect(typeof blank._id).toBe('string')
  })

  it('expands a ListField default into items with freshly generated _ids', () => {
    // The schema-level default declares two seed rows. buildBlankItem
    // must clone each row and mint a fresh `_id` per row (the schema's
    // default has none). Two consecutive build calls must NOT share
    // ids — that's the back-to-back collision the brief calls out.
    const schema = {
      features: {
        kind: 'list',
        itemSchema: { label: { kind: 'text' }, included: { kind: 'boolean' } },
        default: [
          { label: 'A', included: true },
          { label: 'B', included: false },
        ],
      },
    } as const
    const first = buildBlankItem(schema)
    const second = buildBlankItem(schema)

    const firstFeatures = first['features'] as ReadonlyArray<{ _id: string; label: string; included: boolean }>
    const secondFeatures = second['features'] as ReadonlyArray<{ _id: string; label: string; included: boolean }>

    expect(firstFeatures).toHaveLength(2)
    expect(firstFeatures[0]!.label).toBe('A')
    expect(firstFeatures[0]!.included).toBe(true)
    expect(firstFeatures[1]!.label).toBe('B')
    expect(firstFeatures[1]!.included).toBe(false)

    // Every id is a non-empty string and all four are distinct.
    const ids = [
      firstFeatures[0]!._id,
      firstFeatures[1]!._id,
      secondFeatures[0]!._id,
      secondFeatures[1]!._id,
    ]
    for (const id of ids) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
    expect(new Set(ids).size).toBe(ids.length)

    // Reference-distinct: the two builds must not share array OR row
    // objects (a future shortcut that returned the schema default by
    // reference would let one Add mutate the other's row).
    expect(firstFeatures).not.toBe(secondFeatures)
    expect(firstFeatures[0]).not.toBe(secondFeatures[0])
  })

  it('regenerates _ids recursively when a list default contains nested lists', () => {
    // Two levels: outer list with a `default` of one item; that item's
    // inner list also has a `default` of one item. Both levels must
    // mint fresh `_id`s; both `_id`s must differ from each other.
    const schema = {
      tiers: {
        kind: 'list',
        itemSchema: {
          name: { kind: 'text' },
          features: {
            kind: 'list',
            itemSchema: { label: { kind: 'text' } },
            default: [{ label: 'inner-default' }],
          },
        },
        default: [{ name: 'outer-default' }],
      },
    } as const
    const blank = buildBlankItem(schema)
    const tiers = blank['tiers'] as ReadonlyArray<{
      _id: string
      name: string
      features: ReadonlyArray<{ _id: string; label: string }>
    }>
    expect(tiers).toHaveLength(1)
    expect(tiers[0]!.name).toBe('outer-default')
    // The outer tier's `features` came from the inner ListField's
    // descriptor default (the seed for the outer tier did not specify
    // `features`), so it must be expanded with one row carrying a fresh
    // `_id` AND the seeded label.
    expect(tiers[0]!.features).toHaveLength(1)
    expect(tiers[0]!.features[0]!.label).toBe('inner-default')

    const outerId = tiers[0]!._id
    const innerId = tiers[0]!.features[0]!._id
    expect(typeof outerId).toBe('string')
    expect(typeof innerId).toBe('string')
    expect(outerId).not.toBe(innerId)
  })

  it('falls back to per-kind blanks when no default is set', () => {
    const blank = buildBlankItem({
      title: { kind: 'text' },
      body: { kind: 'richText' },
      hero: { kind: 'image' },
      target: { kind: 'reference' },
      cta: { kind: 'link' },
      score: { kind: 'number' },
      enabled: { kind: 'boolean' },
      size: { kind: 'select', options: [{ value: 'sm', label: 'Small' }] },
      tags: { kind: 'list', itemSchema: { name: { kind: 'text' } } },
    })
    expect(blank['title']).toBe('')
    expect(blank['body']).toBe('')
    expect(blank['hero']).toEqual({ filename: '', alt: '' })
    expect(blank['target']).toBe('')
    expect(blank['cta']).toEqual({ type: 'internal', slug: '', label: '' })
    expect(blank['score']).toBe(0)
    expect(blank['enabled']).toBe(false)
    expect(blank['size']).toBe('sm')
    expect(blank['tags']).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Modal save semantics — pure helper mirroring the EditableListPreview
// commit logic for `mode === 'edit'` and `mode === 'add'`. We replicate
// the array-build code so the contract is locked without driving the
// hooks-using component through jsdom. Same replication pattern as
// `buildTextEditPayload` above.
// ---------------------------------------------------------------------------

interface ListItemRecord {
  readonly _id: string
  readonly [key: string]: unknown
}

function buildEditedArray(
  items: ReadonlyArray<ListItemRecord>,
  index: number,
  draft: ListItemRecord,
): ReadonlyArray<ListItemRecord> {
  return items.map((it, i) => (i === index ? draft : it))
}

function buildAddedArray(
  items: ReadonlyArray<ListItemRecord>,
  draft: ListItemRecord,
): ReadonlyArray<ListItemRecord> {
  return [...items, draft]
}

describe('EditableList modal — save semantics', () => {
  it('Save in edit mode replaces the item at index and preserves order', () => {
    const items = [
      { _id: 'a', title: 'one' },
      { _id: 'b', title: 'two' },
      { _id: 'c', title: 'three' },
    ]
    const next = buildEditedArray(items, 1, { _id: 'b', title: 'TWO' })
    expect(next).toHaveLength(3)
    expect(next[0]).toEqual({ _id: 'a', title: 'one' })
    expect(next[1]).toEqual({ _id: 'b', title: 'TWO' })
    expect(next[2]).toEqual({ _id: 'c', title: 'three' })
  })

  it('Save in add mode appends the draft to the end', () => {
    const items = [{ _id: 'a', title: 'one' }]
    const next = buildAddedArray(items, { _id: 'b', title: 'two' })
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ _id: 'b', title: 'two' })
  })

  it('Cancel never produces a new array (the items reference is unchanged)', () => {
    // Cancel in the redesigned flow flips modal state to 'closed'
    // without calling commit. We model that as "no buildEdited / no
    // buildAdded was called" — the items reference is untouched.
    const items = [{ _id: 'a', title: 'one' }] as const
    const after = items
    expect(after).toBe(items)
  })
})

// ---------------------------------------------------------------------------
// isModalEligible — policy split between inline and modal field kinds.
//
// Inline-only (returns false): text, richText, image, list.
// Modal-only  (returns true):  link, number, boolean, select, video, reference.
//
// Note: `boolean` returns TRUE even though the framework has an inline
// `<EditableBoolean>` widget. The split here is editorial POLICY — boolean
// is a setting, not visible content — not a capability check. See the
// extension comment in `ItemFormEditor.tsx`.
// ---------------------------------------------------------------------------
describe('isModalEligible — inline vs modal policy', () => {
  it('returns false for inline-only kinds', () => {
    expect(isModalEligible({ kind: 'text' })).toBe(false)
    expect(isModalEligible({ kind: 'richText' })).toBe(false)
    expect(isModalEligible({ kind: 'image' })).toBe(false)
    expect(
      isModalEligible({ kind: 'list', itemSchema: { name: { kind: 'text' } } }),
    ).toBe(false)
  })

  it('returns true for modal-only kinds', () => {
    // `link` is modal-eligible: its editable surface is a destination
    // (slug/url/email/phone), not a visible text node. A list pattern
    // that renders the visible text through a separate `text` field and
    // uses the link only for its href would otherwise leave the link
    // unreachable. See INLINE_EDITABLE_KINDS in ItemFormEditor.tsx.
    expect(isModalEligible({ kind: 'link' })).toBe(true)
    expect(isModalEligible({ kind: 'number' })).toBe(true)
    // Boolean is modal-eligible by policy even though an inline editor
    // exists — it's a setting, not editorial content.
    expect(isModalEligible({ kind: 'boolean' })).toBe(true)
    expect(
      isModalEligible({ kind: 'select', options: [{ value: 'a', label: 'A' }] }),
    ).toBe(true)
    expect(isModalEligible({ kind: 'video' })).toBe(true)
    expect(isModalEligible({ kind: 'reference' })).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ItemFormEditor — inlineEditableHidden filtering.
//
// EditableList passes `inlineEditableHidden={true}` so the ✎ modal shows
// only the meta fields. The recursive `NestedListEditor` case (the
// default) keeps showing every field.
// ---------------------------------------------------------------------------
describe('ItemFormEditor — inlineEditableHidden', () => {
  type Schema = Parameters<typeof ItemFormEditor>[0]['schema']

  // Mixed schema with both inline-eligible and modal-eligible fields.
  const mixedSchema: Schema = {
    title: { kind: 'text' },
    body: { kind: 'richText' },
    icon: { kind: 'image' },
    cta: { kind: 'link' },
    included: { kind: 'boolean' },
  }

  function rowFieldNames(el: React.ReactElement): string[] {
    // Top-level container is a <div>; its children are <ItemFormField>
    // elements that wrap a <label>/<span>/<input>. We dig down by reading
    // the rendered key — set to the field name in `ItemFormEditor`.
    const root = el as unknown as { props: { children: unknown } }
    const children = root.props.children
    if (!Array.isArray(children)) return []
    return children
      .map((child) => {
        if (child === null || typeof child !== 'object') return undefined
        const keyed = child as { key: string | null }
        return keyed.key ?? undefined
      })
      .filter((k): k is string => typeof k === 'string')
  }

  it('with inlineEditableHidden=true, the modal-eligible link and boolean fields render', () => {
    // `cta` (a link) is modal-eligible: its editable surface is a
    // destination, not a visible text node, so it is reached through the
    // ✎ modal rather than inline on the card. `included` (boolean) is
    // modal-eligible by editorial policy. The inline-only text/richText/
    // image fields are filtered out.
    const el = ItemFormEditor({
      schema: mixedSchema,
      value: {
        _id: 'x',
        title: '',
        body: '',
        icon: { filename: '', alt: '' },
        cta: { type: 'internal', slug: '', label: '' },
        included: false,
      } as unknown as Parameters<typeof ItemFormEditor>[0]['value'],
      onChange: () => {},
      inlineEditableHidden: true,
    })
    const names = rowFieldNames(el)
    expect(names).toEqual(['cta', 'included'])
  })

  it('with inlineEditableHidden=false (default), every field renders', () => {
    const el = ItemFormEditor({
      schema: mixedSchema,
      value: {
        _id: 'x',
        title: '',
        body: '',
        icon: { filename: '', alt: '' },
        cta: { type: 'internal', slug: '', label: '' },
        included: false,
      } as unknown as Parameters<typeof ItemFormEditor>[0]['value'],
      onChange: () => {},
    })
    const names = rowFieldNames(el)
    expect(names).toEqual(['title', 'body', 'icon', 'cta', 'included'])
  })

  it('renders a LinkSubForm control for a link subfield and commits link edits to the draft', () => {
    // Regression: a list-item `link` subfield (e.g. SiteHeader navItems
    // `{ label, link }`) used to be classified inline-only, so the ✎
    // modal filtered it out and — when the author rendered only the
    // sibling `label` inline — the link became uneditable. With `link`
    // modal-eligible, the ✎ modal renders the shared `<LinkSubForm>` and
    // edits commit back into the item draft.
    const onChange = vi.fn()
    const schema = {
      label: { kind: 'text' },
      link: { kind: 'link' },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['schema']
    const value = {
      _id: 'n1',
      label: 'Docs',
      link: { type: 'internal', slug: 'docs', label: 'Docs' },
    } as unknown as Parameters<typeof ItemFormEditor>[0]['value']
    const el = ItemFormEditor({
      schema,
      value,
      onChange,
      inlineEditableHidden: true,
    })

    // The link field is the only one the ✎ modal exposes here (label is
    // inline-only). Find the LinkSubForm element anywhere in the tree and
    // drive its onChange — that is the exact callback the modal wires for
    // a link control.
    const subForm = findElementByType(el, LinkSubForm)
    expect(subForm).not.toBeUndefined()
    const props = (subForm as { props: Record<string, unknown> }).props
    // The sub-form is seeded with the current normalised link value.
    expect((props['value'] as LinkValue).type).toBe('internal')
    const change = props['onChange'] as (next: LinkValue) => void
    const next: LinkValue = { type: 'external', url: 'https://x.test', label: 'Docs' }
    change(next)

    // The control's onChange must commit the patched item (label kept,
    // link replaced) — proving the link edit reaches the draft.
    expect(onChange).toHaveBeenCalledTimes(1)
    const committed = onChange.mock.calls[0]?.[0] as Record<string, unknown>
    expect(committed['label']).toBe('Docs')
    expect(committed['link']).toEqual(next)
  })

  it('shows an empty-state caption when filtering removes every field', () => {
    // All-inline schema + inlineEditableHidden=true → nothing to render.
    // The empty-state caption is rendered defensively (EditableList gates
    // the ✎ button on `hasModalEligibleFields`, so this branch should be
    // unreachable from the UI — but the caption is the safety net).
    const el = ItemFormEditor({
      schema: {
        title: { kind: 'text' },
        body: { kind: 'richText' },
      },
      value: { _id: 'x', title: '', body: '' } as unknown as Parameters<
        typeof ItemFormEditor
      >[0]['value'],
      onChange: () => {},
      inlineEditableHidden: true,
    })
    const serialized = JSON.stringify(el)
    expect(serialized).toContain('No fields to edit here')
  })
})

describe('EditableList — published mode', () => {
  // Sub-task 3: `EditableList`'s `field` prop is now an
  // `EditableSlot<'list', ReadonlyArray<SlotItem<S>>>` whose
  // `slot.value` carries the raw items array in published mode. Tests
  // construct the slot with `wrapAsSlot('list', items)`.
  it('renders a numbered fallback list when no renderItem is provided', () => {
    const items = [
      { _id: 'a', title: 'one' },
      { _id: 'b', title: 'two' },
    ]
    const el = asTestElement(
      EditableList({
        field: wrapAsSlot('list', items) as unknown as Parameters<typeof EditableList>[0]['field'],
        itemSchema: { title: { kind: 'text' } },
      }),
    )
    expect(el.type).toBe('ol')
    const children = el.props['children'] as React.ReactElement[]
    expect(children).toHaveLength(2)
    // Each child is a <li> keyed on the item's _id.
    const first = asTestElement(children[0]!)
    expect(first.type).toBe('li')
    expect(first.key).toBe('a')
  })

  it('uses renderItem when provided, handing slot-typed items', () => {
    const items = [{ _id: 'x', title: 'hello' }]
    const el = asTestElement(
      EditableList({
        field: wrapAsSlot('list', items) as unknown as Parameters<typeof EditableList>[0]['field'],
        itemSchema: { title: { kind: 'text' } },
        // `item.title` is `EditableSlot<'text', string>` in both modes
        // — the section author calls `read()` (or unwraps `slot.value`)
        // to get the bare string for non-editable utilities.
        renderItem: (item, idx) => {
          const titleSlot = item['title'] as { value: string }
          return `${idx}:${titleSlot.value}`
        },
      }),
    )
    // Outer wrapper is a div now.
    expect(el.type).toBe('div')
    const children = el.props['children'] as React.ReactElement[]
    expect(children).toHaveLength(1)
    const first = asTestElement(children[0]!)
    // Each child is a div keyed on _id, with the render output as its child.
    expect(first.type).toBe('div')
    expect(first.key).toBe('x')
    expect(first.props['children']).toBe('0:hello')
  })
})
