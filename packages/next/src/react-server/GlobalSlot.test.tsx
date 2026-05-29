// Tests for `<GlobalSlot>` server component behavior.
//
// `<GlobalSlot>` is an async server component. We invoke it directly
// (it's a plain async function) and inspect its returned React element.
// Same pattern T-015 used to test `<SectionRenderer>`.

import { describe, it, expect } from 'vitest'

import { GlobalSlot } from './GlobalSlot'
import type { GetGlobal } from '../runtime/getGlobal'
import type { AnySectionDefinition } from '../sections/index'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function HeaderComponent(props: Record<string, unknown>): React.ReactElement {
  return <header data-testid="rendered-header">{String(props['title'] ?? '')}</header>
}

const headerDef = {
  name: 'SiteHeader',
  // Real SectionDefinition has `schema` and `defaults`; the renderer only
  // needs `name` and `component`. Cast to satisfy the readonly array type.
  component: HeaderComponent as unknown,
} as unknown as AnySectionDefinition

interface TestElement {
  type: unknown
  props: Record<string, unknown>
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

// ---------------------------------------------------------------------------
// 1. Missing global → fallback
// ---------------------------------------------------------------------------

describe('GlobalSlot — missing global', () => {
  it('returns null when getGlobal returns null and no fallback is provided', async () => {
    const getGlobal: GetGlobal = async () => null

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
    })

    expect(result).toBeNull()
  })

  it('renders the fallback when getGlobal returns null', async () => {
    const getGlobal: GetGlobal = async () => null

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
      fallback: <div>missing</div>,
    })

    expect(result).not.toBeNull()
    // Fragment containing the fallback.
    const el = asTestElement(result!)
    // children of the fragment should include our <div>.
    const children = el.props['children']
    expect(children).toBeDefined()
  })

  it('renders the fallback when getGlobal rejects (adapter I/O failure)', async () => {
    // Regression: `getGlobal` throwing (corrupt JSON, ENOENT racing with
    // a writer, etc.) used to take down the whole RSC tree. The slot now
    // catches and falls through to the missing-global path so a header
    // or footer crash cannot crater the page.
    const getGlobal: GetGlobal = async () => {
      throw new Error('disk failure')
    }

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
      fallback: <div>missing</div>,
    })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    const children = el.props['children']
    expect(children).toBeDefined()
  })

  it('returns null when getGlobal rejects and no fallback is provided', async () => {
    const getGlobal: GetGlobal = async () => {
      throw new Error('disk failure')
    }

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
    })

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Missing definition → fallback
// ---------------------------------------------------------------------------

describe('GlobalSlot — missing section definition', () => {
  it('returns null when the global type is not in the registry', async () => {
    const getGlobal: GetGlobal = async () => ({
      name: 'x',
      type: 'UnknownType',
      data: { foo: 'bar' },
    })

    const result = await GlobalSlot({
      name: 'x',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
    })

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Published mode — direct render, no provider
// ---------------------------------------------------------------------------

describe('GlobalSlot — published mode', () => {
  it('renders the matched component with bare data, no save provider', async () => {
    const getGlobal: GetGlobal = async () => ({
      name: 'site-header',
      type: 'SiteHeader',
      data: { title: 'agntcms' },
    })

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'published',
    })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    // The rendered element is the section component directly.
    expect(el.type).toBe(HeaderComponent)
    expect(el.props['title']).toBe('agntcms')
  })
})

// ---------------------------------------------------------------------------
// 4. Preview mode — wrapped in GlobalSaveProvider
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Defaults merge BEFORE slot wrapping (regression for the v0.2 crash)
// ---------------------------------------------------------------------------
//
// `<SectionRenderer>` already merges `definition.defaults` UNDER section
// data before lifting fields into slots. `<GlobalSlot>` must do the
// same, otherwise schema fields absent from `global.data` (newly added
// to the schema, never saved) reach the section component as `undefined`
// — and `EditableSlot<K, V>` props don't tolerate `undefined` the way
// the v0.1 raw-prop type did, so editable widgets crash on `slot.value`.

describe('GlobalSlot — defaults merge before slot wrap', () => {
  it('fills schema fields missing from global.data with definition.defaults (published mode)', async () => {
    // Component reads BOTH `title` (in data) and `subtitle` (only in
    // defaults). Without the merge, `subtitle` arrives `undefined` and
    // editable widgets that expected `slot.value` crash. With the
    // merge, the missing field falls back to its default.
    function Header(props: Record<string, unknown>): React.ReactElement {
      const title = (props['title'] as { value: string } | undefined)?.value ?? ''
      const subtitle = (props['subtitle'] as { value: string } | undefined)?.value ?? ''
      return <header>{title}|{subtitle}</header>
    }
    const def = {
      name: 'SiteHeader',
      // Real schema shape doesn't matter for `wrapSectionProps`'s
      // structural walk — it dispatches on `descriptor.kind`. We supply
      // the minimum two fields the test needs.
      schema: {
        title: { kind: 'text' },
        subtitle: { kind: 'text' },
      },
      defaults: { title: 'Default title', subtitle: 'Default subtitle' },
      component: Header as unknown,
    } as unknown as AnySectionDefinition

    const getGlobal: GetGlobal = async () => ({
      name: 'site-header',
      type: 'SiteHeader',
      // `subtitle` deliberately absent from data.
      data: { title: 'Actual title' },
    })

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [def],
      mode: 'published',
    })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    expect(el.type).toBe(Header)
    // `subtitle` filled from defaults; both arrive slot-wrapped.
    expect(el.props['title']).toEqual({ value: 'Actual title' })
    expect(el.props['subtitle']).toEqual({ value: 'Default subtitle' })
  })

  it('synthesizes a PreviewField wrapper for missing-field defaults in preview mode', async () => {
    // Preview-mode parity with `<SectionRenderer>`: when any value in
    // `global.data` is preview-wrapped, missing-field defaults must
    // arrive as PreviewField wrappers too — otherwise EditableText sees
    // a plain string and refuses to enter edit mode (the user can't
    // click the placeholder text). The synthesized origin carries
    // `kind: 'global'` + `globalName` so saves route to the global
    // endpoint via `GlobalSaveProvider`.
    function Header(props: Record<string, unknown>): React.ReactElement {
      // Read from the slot wrapper exactly the way an editable widget
      // would, to prove `subtitle` is structurally a slot whose `.value`
      // carries the synthesized PreviewField.
      const subtitleSlot = props['subtitle'] as { value: unknown } | undefined
      return <header>{String((subtitleSlot?.value as { value: string } | undefined)?.value ?? '')}</header>
    }
    const def = {
      name: 'SiteHeader',
      schema: {
        title: { kind: 'text' },
        subtitle: { kind: 'text' },
      },
      defaults: { title: 'Default title', subtitle: 'Default subtitle' },
      component: Header as unknown,
    } as unknown as AnySectionDefinition

    const wrappedTitle = {
      __agntcmsPreview: true,
      value: 'Actual title',
      origin: {
        kind: 'global' as const,
        globalName: 'site-header',
        pageSlug: '__global__:site-header',
        sectionId: 'site-header',
        fieldPath: 'title',
        source: 'draft' as const,
        revision: 'r0',
      },
    }

    const getGlobal: GetGlobal = async () => ({
      name: 'site-header',
      type: 'SiteHeader',
      // `subtitle` absent — must be synthesized from defaults as a
      // PreviewField so the editable widget can click-to-edit.
      data: { title: wrappedTitle },
    })

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [def],
      mode: 'preview',
    })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    // Outer element is the GlobalSaveProvider; the actual component is
    // its child. Pull the child off props['children'].
    const child = el.props['children'] as { props: Record<string, unknown> }
    // `subtitle` arrives as a slot whose `.value` is the synthesized
    // PreviewField wrapper — same shape an existing wrapped field has.
    const subtitleSlot = child.props['subtitle'] as { value: unknown }
    expect(subtitleSlot).toBeDefined()
    const inner = subtitleSlot.value as Record<string, unknown>
    expect(inner['__agntcmsPreview']).toBe(true)
    expect(inner['value']).toBe('Default subtitle')
    const innerOrigin = inner['origin'] as Record<string, unknown>
    expect(innerOrigin['kind']).toBe('global')
    expect(innerOrigin['globalName']).toBe('site-header')
    expect(innerOrigin['fieldPath']).toBe('subtitle')
  })
})

describe('GlobalSlot — preview mode', () => {
  it('wraps the rendered component in a GlobalSaveProvider', async () => {
    const wrappedField = {
      __agntcmsPreview: true,
      value: 'agntcms',
      origin: {
        kind: 'global',
        globalName: 'site-header',
        pageSlug: '__global__:site-header',
        sectionId: 'site-header',
        fieldPath: 'title',
        source: 'draft',
        revision: 'r1',
      },
    }

    const getGlobal: GetGlobal = async () => ({
      name: 'site-header',
      type: 'SiteHeader',
      data: { title: wrappedField },
    })

    const result = await GlobalSlot({
      name: 'site-header',
      getGlobal,
      definitions: [headerDef],
      mode: 'preview',
    })

    expect(result).not.toBeNull()
    const el = asTestElement(result!)
    // The outer element is the GlobalSaveProvider; its inner child
    // is the section component.
    const providerProps = el.props
    expect(providerProps['globalName']).toBe('site-header')
    expect(providerProps['globalType']).toBe('SiteHeader')
    expect(providerProps['initialData']).toBeDefined()
  })
})
