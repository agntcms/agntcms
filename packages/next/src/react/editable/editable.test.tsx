import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createElement } from 'react'
import type { PreviewFieldLike } from './isPreviewField'
import { isPreviewField } from './isPreviewField'
// `wrapAsSlot` lifts a bare value (or a preview-wrapped value) into the
// slot shape every editable component now consumes (EDITABILITY_DESIGN.md
// sub-task 2). Tests use it so the fixture matches what SectionRenderer
// hands to the component at runtime.
import { wrapAsSlot } from '../../sections/index'
import { EditableText } from './EditableText'
import {
  EditableImage,
  placeholderTooltipProps,
  renderImagePlaceholder,
} from './EditableImage'
import { MarkdownEditorModal } from './MarkdownEditorModal'
import { PlainTextEditorModal } from './PlainTextEditorModal'
import { SaveProvider, useSaveField } from './SaveContext'
import { placeholderHintFromOrigin } from './placeholderHint'

// ---------------------------------------------------------------------------
// Test helpers — same pattern as SectionRenderer.test.tsx (T-015).
// ---------------------------------------------------------------------------

interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

function makePreviewField<T>(value: T, overrides?: Partial<PreviewFieldLike<T>['origin']>): PreviewFieldLike<T> {
  return {
    __agntcmsPreview: true,
    value,
    origin: {
      pageSlug: 'home',
      sectionId: 's-hero',
      fieldPath: 'title',
      source: 'draft',
      revision: 'abc123',
      ...overrides,
    },
  }
}

// ---------------------------------------------------------------------------
// isPreviewField
// ---------------------------------------------------------------------------

describe('isPreviewField', () => {
  it('returns true for a valid preview field object', () => {
    const field = makePreviewField('hello')
    expect(isPreviewField(field)).toBe(true)
  })

  it('returns false for a bare string', () => {
    expect(isPreviewField('hello')).toBe(false)
  })

  it('returns false for a bare number', () => {
    expect(isPreviewField(42)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPreviewField(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPreviewField(undefined)).toBe(false)
  })

  it('returns false for an object without the brand property', () => {
    expect(isPreviewField({ value: 'x', origin: {} })).toBe(false)
  })

  it('returns false when __agntcmsPreview is false', () => {
    expect(isPreviewField({ __agntcmsPreview: false, value: 'x' })).toBe(false)
  })

  it('returns false when __agntcmsPreview is a truthy non-true value', () => {
    expect(isPreviewField({ __agntcmsPreview: 'yes', value: 'x' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// EditableText — published mode
//
// In published mode, EditableText returns early before any hooks are
// called, so we can call it as a plain function in tests.
// ---------------------------------------------------------------------------

describe('EditableText (published mode)', () => {
  it('renders the bare text value as a plain child in a div by default', () => {
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'Hello world') }))
    expect(el.type).toBe('div')
    // Step 3 of the marketing-site primitives rollout: EditableText is
    // now plain text. The value is rendered as a React text child, NOT
    // via dangerouslySetInnerHTML. React auto-escapes — no XSS risk.
    expect(el.props['children']).toBe('Hello world')
    expect(el.props['dangerouslySetInnerHTML']).toBeUndefined()
  })

  it('renders with a custom tag via the `as` prop', () => {
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'Title'), as: 'h1' }))
    expect(el.type).toBe('h1')
    expect(el.props['children']).toBe('Title')
  })

  it('renders literal markdown characters verbatim (no markdown processing)', () => {
    // Step 3 fork: EditableText must NOT process markdown. A title
    // containing `**bold**` should render the asterisks literally, not
    // wrap "bold" in <strong>. RichTextField content goes through
    // EditableRichText and keeps markdown rendering.
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', '**bold**') }))
    expect(el.props['children']).toBe('**bold**')
    expect(el.props['dangerouslySetInnerHTML']).toBeUndefined()
  })

  it('applies whiteSpace: pre-wrap so embedded \\n renders as a line break', () => {
    // TextField values are usually single-line, but the schema does not
    // forbid newlines. Without pre-wrap, multi-line text would collapse.
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'a\nb') }))
    const style = el.props['style'] as { whiteSpace?: string } | undefined
    expect(style?.whiteSpace).toBe('pre-wrap')
  })

  it('renders empty string when given a slot whose inner value is undefined (defensive)', () => {
    // Slot props don't carry `undefined` as a top-level type after sub-task
    // 2, but the inner value can still be `undefined` if a renderer puts
    // a missing field through `wrapAsSlot('text', undefined)`. Cast to
    // satisfy `EditableSlot<'text', string>` — the `?? ''` guard keeps
    // SSR safe.
    const el = asTestElement(
      EditableText({ field: wrapAsSlot('text', undefined as unknown as string) }),
    )
    expect(el.props['children']).toBe('')
  })

  it('applies className', () => {
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'text'), className: 'my-class' }))
    expect(el.props['className']).toBe('my-class')
  })

  it('has no data-agntcms-editable attribute', () => {
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'text') }))
    expect(el.props['data-agntcms-editable']).toBeUndefined()
  })

  it('has no onClick handler', () => {
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'text') }))
    expect(el.props['onClick']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// EditableText — preview mode
//
// In preview mode, EditableText returns an <EditableTextPreview> element.
// We inspect the element tree (type, props) without invoking the inner
// component's hooks. The inner component is the private
// EditableTextPreview function — we identify it by being a function type.
// ---------------------------------------------------------------------------

describe('EditableText (preview mode)', () => {
  it('delegates to the inner preview component', () => {
    const inner = makePreviewField('Hello')
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', inner) }))

    // The outer component returns <EditableTextPreview ...>, which is a
    // React element whose type is the inner function component.
    expect(typeof el.type).toBe('function')
  })

  it('passes the unwrapped preview field, as, className, and onSave to the inner component', () => {
    // The OUTER `field` prop is a slot; the OUTER component reads
    // `slot.value` and forwards the inner `PreviewFieldLike<…>` to its
    // private inner component. So `el.props['field']` on the returned
    // element is the inner preview field, NOT the slot.
    const onSave = vi.fn()
    const inner = makePreviewField('Hello')
    const el = asTestElement(
      EditableText({ field: wrapAsSlot('text', inner), as: 'h2', className: 'cls', onSave }),
    )

    expect(el.props['field']).toBe(inner)
    expect(el.props['as']).toBe('h2')
    expect(el.props['className']).toBe('cls')
    expect(el.props['onSave']).toBe(onSave)
  })

  it('defaults the `as` prop to div', () => {
    const inner = makePreviewField('Hello')
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', inner) }))
    expect(el.props['as']).toBe('div')
  })
})

// ---------------------------------------------------------------------------
// EditableText — onSave typing
// ---------------------------------------------------------------------------

describe('EditableText onSave', () => {
  it('accepts onSave callback in published mode without error', () => {
    const onSave = vi.fn()
    // Published mode with onSave — should render normally, onSave is
    // never called because there is no edit affordance.
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', 'text'), onSave }))
    expect(el.type).toBe('div')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('passes onSave through to preview component', () => {
    const onSave = vi.fn()
    const inner = makePreviewField('text')
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', inner), onSave }))
    expect(el.props['onSave']).toBe(onSave)
  })
})

// ---------------------------------------------------------------------------
// EditableImage — published mode
//
// 0.1.19: the image field value is an `ImageValue` object (`{ filename, alt }`).
// Alt is collected in the picker modal per-usage and lives in the value —
// it is no longer a prop on `<EditableImage>` and there is no framework-level
// alt default.
// ---------------------------------------------------------------------------

const heroValue: { readonly filename: string; readonly alt: string } = {
  filename: 'hero.png',
  alt: 'Hero banner',
}

describe('EditableImage (published mode)', () => {
  it('renders an img tag with /assets/ prefix', () => {
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', heroValue) }))
    expect(el.type).toBe('img')
    expect(el.props['src']).toBe('/assets/hero.png')
  })

  it('reads alt from the field value', () => {
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', heroValue) }))
    expect(el.props['alt']).toBe('Hero banner')
  })

  it('reads alt from the value even when empty (validation lives elsewhere)', () => {
    // The component is a dumb renderer — empty alt is a content-level
    // validation concern, not a render-time fallback. This test locks
    // that the component does NOT silently substitute any default.
    const el = asTestElement(
      EditableImage({ field: wrapAsSlot('image', { filename: 'x.png', alt: '' }) }),
    )
    expect(el.props['alt']).toBe('')
  })

  it('applies className', () => {
    const el = asTestElement(
      EditableImage({ field: wrapAsSlot('image', heroValue), className: 'img-class' }),
    )
    expect(el.props['className']).toBe('img-class')
  })

  it('has no data-agntcms-editable attribute', () => {
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', heroValue) }))
    expect(el.props['data-agntcms-editable']).toBeUndefined()
  })

  it('has no onClick handler', () => {
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', heroValue) }))
    expect(el.props['onClick']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// EditableImage — preview mode
// ---------------------------------------------------------------------------

describe('EditableImage (preview mode)', () => {
  it('delegates to the inner preview component', () => {
    const inner = makePreviewField(heroValue, { fieldPath: 'image' })
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', inner) }))
    expect(typeof el.type).toBe('function')
  })

  it('passes the unwrapped preview field, className, and onSave to the inner component', () => {
    // Same dispatcher pattern as EditableText: the slot is unwrapped at
    // the outer component, so the inner component sees the bare
    // `PreviewFieldLike<ImageValue>` as its `field` prop.
    const onSave = vi.fn()
    const inner = makePreviewField(heroValue, { fieldPath: 'image' })
    const el = asTestElement(
      EditableImage({ field: wrapAsSlot('image', inner), className: 'cls', onSave }),
    )

    expect(el.props['field']).toBe(inner)
    expect(el.props['className']).toBe('cls')
    expect(el.props['onSave']).toBe(onSave)
  })
})

// ---------------------------------------------------------------------------
// EditableImage — empty-filename placeholder (preview mode)
//
// `renderImagePlaceholder` is the pure helper used by the inner preview
// component when `field.value.filename === ''`. We test the helper
// directly because the preview component itself uses hooks and cannot be
// invoked in the node test environment (see
// `feedback_pure_helpers_for_node_tests`).
//
// Published-mode behavior is intentionally NOT changed: an empty filename
// in published mode still renders `<img src="/assets/" alt="">` (the
// existing test below covers it). The placeholder is preview-only.
// ---------------------------------------------------------------------------

describe('renderImagePlaceholder (preview-mode empty-filename helper)', () => {
  it('renders a div carrying the data-agntcms-image-placeholder attribute', () => {
    const el = asTestElement(renderImagePlaceholder())
    expect(el.type).toBe('div')
    expect(el.props['data-agntcms-image-placeholder']).toBe('')
  })

  it('does NOT render the "No image — click to add" caption', () => {
    // Regression guard: the visible caption was overflowing small wrappers
    // (e.g. a 40×40 icon cell in a Features card). The placeholder must
    // stay text-free; the discoverability hint lives on the wrapper as a
    // hover-tooltip via the `title` attribute (asserted separately below).
    const el = asTestElement(renderImagePlaceholder())
    const collect = (
      node: unknown,
      acc: string[],
    ): string[] => {
      if (typeof node === 'string') {
        acc.push(node)
        return acc
      }
      if (Array.isArray(node)) {
        for (const child of node) collect(child, acc)
        return acc
      }
      if (node && typeof node === 'object' && 'props' in node) {
        const childProps = (node as { props: { children?: unknown } }).props
        collect(childProps.children, acc)
      }
      return acc
    }
    const allText = collect(el.props['children'], []).join(' ')
    expect(allText).not.toContain('No image')
    expect(allText).not.toContain('click to add')
  })

  it('renders an inline SVG icon (currentColor stroke, scales with box)', () => {
    // The emoji glyph was replaced with a single SVG so the icon scales
    // proportionally with the parent (60% width/height, capped at 32px).
    // Asserting `el.type === 'svg'` is the simplest structural check —
    // there is exactly one child element under the placeholder div.
    const el = asTestElement(renderImagePlaceholder())
    const children = el.props['children']
    // Single SVG child (no caption sibling).
    const svg = Array.isArray(children) ? children[0] : children
    expect(asTestElement(svg as React.ReactElement).type).toBe('svg')
  })
})

describe('placeholderTooltipProps (preview-mode wrapper tooltip helper)', () => {
  // The hover-tooltip replaces the visible "No image — click to add"
  // caption: editors discover the click affordance via the browser
  // tooltip on the wrapper. The implementation spreads this helper's
  // result onto the wrapper div, so testing the helper directly locks in
  // the contract without needing to invoke hooks.
  it('returns a title prop when filename is empty', () => {
    expect(placeholderTooltipProps('')).toEqual({
      title: 'Click to add image',
    })
  })

  it('returns no title prop when filename is set', () => {
    expect(placeholderTooltipProps('hero.png')).toEqual({})
  })
})

describe('EditableImage (published mode, empty filename — unchanged behavior)', () => {
  // Regression guard: the placeholder added in the preview path must NOT
  // bleed into published mode. Published mode is hook-free and continues
  // to emit a plain <img>, even when filename is empty.
  it('still renders an <img> element when filename is empty', () => {
    const el = asTestElement(
      EditableImage({ field: wrapAsSlot('image', { filename: '', alt: '' }) }),
    )
    expect(el.type).toBe('img')
    expect(el.props['data-agntcms-image-placeholder']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// EditableImage — onSave typing
// ---------------------------------------------------------------------------

describe('EditableImage onSave', () => {
  it('accepts onSave callback in published mode without error', () => {
    const onSave = vi.fn()
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', heroValue), onSave }))
    expect(el.type).toBe('img')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('passes onSave through to preview component', () => {
    const onSave = vi.fn()
    const inner = makePreviewField(heroValue, { fieldPath: 'image' })
    const el = asTestElement(EditableImage({ field: wrapAsSlot('image', inner), onSave }))
    expect(el.props['onSave']).toBe(onSave)
  })
})

// ---------------------------------------------------------------------------
// SaveContext — structural tests
//
// SaveProvider uses useContext internally so we cannot fully render it
// outside a React render tree. We test the structural shape of the
// provider element and the export presence of useSaveField.
// ---------------------------------------------------------------------------

describe('SaveProvider', () => {
  it('wraps children in a context provider element', () => {
    const saveFn = vi.fn()
    const child = createElement('span', null, 'hello')
    const el = asTestElement(SaveProvider({ saveField: saveFn, children: child }))

    // The provider element should carry the saveField function as its value
    // and the child as its children.
    expect(el.props['value']).toBe(saveFn)
    expect(el.props['children']).toBe(child)
  })
})

describe('useSaveField', () => {
  it('is exported as a function', () => {
    expect(typeof useSaveField).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// EditableText no longer renders the ✨ agent button or modal at the text
// level (post-refactor). The ✨ action moved INTO MarkdownEditorModal's
// toolbar — tested below.
// ---------------------------------------------------------------------------

describe('EditableText preview tree (agent button removed from text hover)', () => {
  it('returns a single EditableTextPreview element (no sibling fragment)', () => {
    // The outer EditableText in preview mode returns a plain
    // EditableTextPreview element, not a fragment with sibling controls.
    // Regression guard: pre-v0.5 there was a sibling agent button here;
    // it was removed when the channel was dropped. Keeping the assertion
    // catches any future drive-by wrap of the preview output.
    const inner = makePreviewField('Hello')
    const el = asTestElement(EditableText({ field: wrapAsSlot('text', inner) }))

    expect(typeof el.type).toBe('function')
    // The outer element is the preview component directly; it does not
    // carry a `children` array of sibling controls at this level.
    expect(el.props['children']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// MarkdownEditorModal — structural tests (hooks cannot run in node env).
// ---------------------------------------------------------------------------

describe('MarkdownEditorModal', () => {
  it('is exported as a function component', () => {
    expect(typeof MarkdownEditorModal).toBe('function')
  })

  it('accepts an optional origin prop without throwing at type level', () => {
    // Pure compile-time guarantee — if the type shape regresses, the call
    // below will fail tsc. We never actually invoke the function here
    // (hooks cannot run outside a React render tree).
    const _callable: (props: {
      value: string
      fieldPath: string
      origin?: PreviewFieldLike<string>['origin']
      onSave: (v: string) => void
      onCancel: () => void
    }) => unknown = MarkdownEditorModal
    expect(typeof _callable).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// MarkdownEditorModal agent dispatch — replicates the payload-building
// logic in handleAgentSubmit so we can assert the contract without a
// React render tree. Same replication pattern as stripKind in
// agent.test.tsx. Locks in:
//   - kind is always 'text_edit'
//   - currentValue is the CURRENT DRAFT (not the original `value`)
//   - origin fields are spread individually, not nested
// ---------------------------------------------------------------------------

function buildTextEditPayload(
  draft: string,
  origin: PreviewFieldLike<string>['origin'],
  instructions: string,
): {
  kind: 'text_edit'
  pageSlug: string
  sectionId: string
  fieldPath: string
  currentValue: string
  instructions: string
} {
  return {
    kind: 'text_edit',
    pageSlug: origin.pageSlug,
    sectionId: origin.sectionId,
    fieldPath: origin.fieldPath,
    currentValue: draft,
    instructions,
  }
}

describe('MarkdownEditorModal ✨ dispatch payload', () => {
  it('uses the current draft as currentValue (not the initial value)', () => {
    // The user opens the editor with `value="Hello"`, types more, and THEN
    // clicks ✨. The dispatched payload must carry the edited draft.
    const initialValue = 'Hello'
    const draft = 'Hello, edited'
    const origin = makePreviewField('ignored').origin
    const payload = buildTextEditPayload(draft, origin, 'make it friendlier')

    expect(payload.currentValue).toBe(draft)
    expect(payload.currentValue).not.toBe(initialValue)
  })

  it('builds a flat text_edit payload with origin fields at the top level', () => {
    const origin = makePreviewField('x', {
      pageSlug: 'home',
      sectionId: 'sec_1',
      fieldPath: 'title',
    }).origin

    const payload = buildTextEditPayload('draft text', origin, 'shorter')

    expect(payload).toEqual({
      kind: 'text_edit',
      pageSlug: 'home',
      sectionId: 'sec_1',
      fieldPath: 'title',
      currentValue: 'draft text',
      instructions: 'shorter',
    })
  })
})

// ---------------------------------------------------------------------------
// PlainTextEditorModal — structural tests (hooks cannot run in node env).
//
// Locks the contract that EditableText opens a plain-text modal, NOT the
// markdown editor. The fork is deliberate: TextField values like URLs and
// SEO titles must not get markdown toolbars (B / I / 🔗) or a Source /
// Preview split. EditableRichText still uses MarkdownEditorModal.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// placeholderHintFromOrigin — pure helper for empty-value preview hints.
// ---------------------------------------------------------------------------

describe('placeholderHintFromOrigin', () => {
  it('returns "Click to edit title" for a bare segment', () => {
    expect(placeholderHintFromOrigin('title')).toBe('Click to edit title')
  })

  it('strips a trailing [N] index and uses the segment name', () => {
    expect(placeholderHintFromOrigin('features[0].title')).toBe('Click to edit title')
  })

  it('uses the LAST segment for nested list paths', () => {
    expect(placeholderHintFromOrigin('tiers[2].features[0].label')).toBe(
      'Click to edit label',
    )
  })

  it('handles a plain field name without dots', () => {
    expect(placeholderHintFromOrigin('body')).toBe('Click to edit body')
  })

  it('falls back to "Click to edit" for an empty path', () => {
    expect(placeholderHintFromOrigin('')).toBe('Click to edit')
  })
})

// ---------------------------------------------------------------------------
// EditableText / EditableRichText — empty-value placeholder source-level checks.
//
// Hooks make these components unrenderable in the node test env, but we can
// still assert that the placeholder branch exists in the source. The checks
// guard the contract that:
//   - the preview-mode rendering branches consult `isBlankString` on the value
//   - `placeholderHintFromOrigin` is invoked with `field.origin.fieldPath`
//   - `PLACEHOLDER_HINT_STYLE` is applied (italic + muted color)
//   - the published-mode branch (the early return before isPreviewField()
//     resolves to true) does NOT touch the placeholder helpers
// Same source-level pattern as the EditableList card-click guard in
// `newFields.test.tsx`.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const editableTextSource = readFileSync(
  resolve(__dirname, 'EditableText.tsx'),
  'utf-8',
)
const editableRichTextSource = readFileSync(
  resolve(__dirname, 'EditableRichText.tsx'),
  'utf-8',
)

describe('EditableText empty-value placeholder (source)', () => {
  it('imports the placeholder helpers', () => {
    expect(editableTextSource).toContain('isBlankString')
    expect(editableTextSource).toContain('placeholderHintFromOrigin')
    expect(editableTextSource).toContain('PLACEHOLDER_HINT_STYLE')
  })

  it('checks the value with isBlankString in the preview branch', () => {
    expect(editableTextSource).toMatch(/isBlankString\(rawValue\)/)
  })

  it('renders the hint via a nested span (no new wrapper div)', () => {
    // The placeholder must live inside the existing Tag — adding a new
    // wrapper div would shift positioning. We assert the span uses the
    // hint style.
    expect(editableTextSource).toMatch(
      /<span style=\{PLACEHOLDER_HINT_STYLE\}>/,
    )
  })

  it('does NOT render the placeholder in published mode', () => {
    // Sanity: the published-mode early return (the `!isPreviewField` branch)
    // must come BEFORE any reference to the placeholder helpers. A
    // regression that hoists the placeholder into the published branch
    // would put a "Click to edit ..." hint into HTML served to public
    // visitors.
    const publishedReturnIdx = editableTextSource.indexOf(
      'if (!isPreviewField',
    )
    const placeholderUseIdx = editableTextSource.indexOf('isBlankString(')
    expect(publishedReturnIdx).toBeGreaterThan(-1)
    expect(placeholderUseIdx).toBeGreaterThan(publishedReturnIdx)
  })
})

describe('EditableRichText empty-value placeholder (source)', () => {
  it('imports the placeholder helpers', () => {
    expect(editableRichTextSource).toContain('isBlankString')
    expect(editableRichTextSource).toContain('placeholderHintFromOrigin')
    expect(editableRichTextSource).toContain('PLACEHOLDER_HINT_STYLE')
  })

  it('checks the value with isBlankString in the preview branch', () => {
    expect(editableRichTextSource).toMatch(/isBlankString\(field\.value\)/)
  })

  it('renders the hint via a nested span using PLACEHOLDER_HINT_STYLE', () => {
    expect(editableRichTextSource).toMatch(
      /<span style=\{PLACEHOLDER_HINT_STYLE\}>/,
    )
  })

  it('does NOT render the placeholder in published mode', () => {
    const publishedReturnIdx = editableRichTextSource.indexOf(
      'if (!isPreviewField',
    )
    const placeholderUseIdx = editableRichTextSource.indexOf('isBlankString(')
    expect(publishedReturnIdx).toBeGreaterThan(-1)
    expect(placeholderUseIdx).toBeGreaterThan(publishedReturnIdx)
  })
})

describe('PlainTextEditorModal', () => {
  it('is exported as a function component', () => {
    expect(typeof PlainTextEditorModal).toBe('function')
  })

  it('is a distinct component from MarkdownEditorModal', () => {
    // Regression guard: if someone re-aliases the two modals later, this
    // assertion catches the loss of the plain/rich split.
    expect(PlainTextEditorModal).not.toBe(MarkdownEditorModal)
  })

  it('accepts the minimal prop shape required by EditableText', () => {
    // Pure compile-time guarantee — the call below would fail tsc if the
    // exported type shape regressed. We never invoke the function (hooks
    // cannot run outside a React render tree).
    const _callable: (props: {
      value: string
      fieldPath: string
      onSave: (v: string) => void
      onCancel: () => void
    }) => unknown = PlainTextEditorModal
    expect(typeof _callable).toBe('function')
  })
})
