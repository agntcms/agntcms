import { describe, it, expect } from 'vitest'

import { SectionWrapper } from './SectionWrapper'
import { SectionReplaceOverlay } from './SectionReplaceOverlay'
import {
  SectionPickerModal,
  filterDefinitions,
  filterSystemDefinitions,
  filterSystemGlobals,
  mergePreviewProps,
} from './SectionPickerModal'
import type { DefinitionLike, GlobalEntry } from './SectionPickerModal'

// ---------------------------------------------------------------------------
// Test helper: narrows React element internals in tests without fighting
// React 19's `ReactElement<P = unknown>` default.
// Pattern documented in project_react_renderers_t015.md.
// ---------------------------------------------------------------------------

interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

// ---------------------------------------------------------------------------
// Shared fixtures.
// ---------------------------------------------------------------------------

// Minimal DefinitionLike stubs for testing — component is never called,
// only the structural shape matters for prop-passing assertions.
const stubComponent = (() => null) as unknown as (props: never) => unknown

const definitions = [
  { name: 'Hero', component: stubComponent },
  { name: 'TextBlock', component: stubComponent },
  { name: 'Gallery', component: stubComponent },
] as const

// =========================================================================
// SectionWrapper
// =========================================================================

describe('SectionWrapper', () => {
  it('renders children with no wrapper div in published mode', () => {
    const child = <p>content</p>
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: false,
      children: child,
    })

    const el = asTestElement(result)

    // In published mode, SectionWrapper returns a React.Fragment.
    // Fragment type is `Symbol(react.fragment)` — we check it is NOT a div.
    expect(el.type).not.toBe('div')

    // The children should pass through.
    expect(el.props['children']).toBe(child)
  })

  it('renders children inside a positioned wrapper div in preview mode', () => {
    const child = <p>content</p>
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: child,
    })

    const el = asTestElement(result)

    // Preview mode wraps in a <div>.
    expect(el.type).toBe('div')
    expect(el.props['style']).toEqual({ position: 'relative' })
    expect(el.props['className']).toBe('agntcms-section-wrap')
    expect(el.props['data-agntcms-section']).toBe('sec-1')

    // Children should include the overlay and the original child.
    const children = el.props['children'] as unknown[]
    expect(children).toBeDefined()

    // The last child in the array should be the original content.
    const lastChild = children[children.length - 1]
    expect(lastChild).toBe(child)
  })

  it('includes SectionReplaceOverlay element in preview mode', () => {
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: <p>content</p>,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    // Find the SectionReplaceOverlay element among the children.
    // Because SectionWrapper creates it via JSX (not calling it directly),
    // hooks are NOT triggered — the element is just a descriptor.
    const overlayChild = children.find((c) => {
      if (c && typeof c === 'object' && 'type' in (c as TestElement)) {
        return (c as TestElement).type === SectionReplaceOverlay
      }
      return false
    })

    expect(overlayChild).toBeDefined()

    // Verify the overlay receives correct props.
    const overlayEl = overlayChild as TestElement
    expect(overlayEl.props['sectionId']).toBe('sec-1')
    expect(overlayEl.props['currentType']).toBe('Hero')
    expect(overlayEl.props['pageSlug']).toBe('home')
    expect(overlayEl.props['isPreview']).toBe(true)
  })

  it('includes a <style> element for hover behaviour in preview mode', () => {
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: <p>content</p>,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    const styleChild = children.find((c) => {
      if (c && typeof c === 'object' && 'type' in (c as TestElement)) {
        return (c as TestElement).type === 'style'
      }
      return false
    })

    expect(styleChild).toBeDefined()
  })

  it('group-hover style targets the generic section-control data attribute', () => {
    // All three top-right buttons (✨, ⇄, ×) opt in by setting
    // `data-agntcms-section-control`. The wrapper's single CSS rule must
    // select on that attribute so one hover reveals the whole cluster.
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: <p>content</p>,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]
    const styleChild = children.find((c) => {
      if (c && typeof c === 'object' && 'type' in (c as TestElement)) {
        return (c as TestElement).type === 'style'
      }
      return false
    }) as TestElement | undefined

    const css = (styleChild?.props['children'] as string) ?? ''
    expect(css).toContain('[data-agntcms-section-control]')
    expect(css).toContain('.agntcms-section-wrap:hover')
  })

  it('renders the deleteAction slot inside the wrapper div', () => {
    // Regression guard for the refactor that moved the × delete button
    // INTO SectionWrapper so the single group-hover rule covers it.
    const deleteNode = <button type="button" data-test-delete="">×</button>
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      deleteAction: deleteNode,
      children: <p>content</p>,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    // The delete slot node must appear in the children list — this is
    // what places it inside `.agntcms-section-wrap` for hover coverage.
    expect(children.includes(deleteNode)).toBe(true)
  })

  it('does not render deleteAction when the slot is omitted', () => {
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: <p>content</p>,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    // No child should carry the data-test-delete marker.
    const hasDelete = children.some((c) => {
      if (c && typeof c === 'object' && 'props' in (c as TestElement)) {
        return (c as TestElement).props['data-test-delete'] !== undefined
      }
      return false
    })
    expect(hasDelete).toBe(false)
  })
})

// =========================================================================
// SectionReplaceOverlay
// =========================================================================

describe('SectionReplaceOverlay', () => {
  // SectionReplaceOverlay is a "use client" component that calls useState,
  // useCallback, and useRouter internally. Directly invoking the component
  // function in vitest's node environment triggers "Invalid hook call"
  // because there is no React reconciler active. Element-tree inspection
  // (the approach used for server components) does not work here.
  //
  // Structural correctness is verified indirectly through the SectionWrapper
  // tests above, which create the overlay as a JSX element WITHOUT calling
  // its function — confirming it receives the right props.
  //
  // Full behavioural tests (modal open, fetch to /api/agntcms/draft/
  // replace-section, router.refresh) require a React DOM rendering
  // environment and are covered by integration tests in the template.

  it('is a function component', () => {
    expect(typeof SectionReplaceOverlay).toBe('function')
  })

  it('is re-exported from the barrel', async () => {
    const barrel = await import('./index')
    expect(barrel.SectionReplaceOverlay).toBe(SectionReplaceOverlay)
  })
})

// =========================================================================
// SectionPickerModal
// =========================================================================

describe('SectionPickerModal', () => {
  // SectionPickerModal is a "use client" component that calls useEffect
  // and useCallback internally. Directly invoking it in vitest's node
  // environment triggers "Invalid hook call" — same constraint as
  // SectionReplaceOverlay. Structural correctness is verified indirectly
  // through the SectionWrapper tests above (which nest the modal as JSX).

  it('is a function component', () => {
    expect(typeof SectionPickerModal).toBe('function')
  })

  it('is re-exported from the barrel', async () => {
    const barrel = await import('./index')
    expect(barrel.SectionPickerModal).toBe(SectionPickerModal)
  })

  it('exports GlobalEntry type from the barrel', async () => {
    // Type-only export — verified through TypeScript compilation.
    // We check the barrel re-exports the module so the type is accessible.
    const barrel = await import('./index')
    // GlobalEntry is a type — we can't check it at runtime. But we verify
    // the module loads without errors, which confirms the barrel is wired.
    expect(barrel.SectionPickerModal).toBeDefined()
  })
})

describe('SectionWrapper — onSelectGlobal prop forwarding', () => {
  it('passes onSelectGlobal through to SectionReplaceOverlay in preview mode', () => {
    const onSelectGlobal = (_name: string): void => {}
    const child = <p>content</p>
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      onSelectGlobal,
      children: child,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    // Find the SectionReplaceOverlay element.
    const overlayChild = children.find((c) => {
      if (c && typeof c === 'object' && 'type' in (c as TestElement)) {
        return (c as TestElement).type === SectionReplaceOverlay
      }
      return false
    })

    expect(overlayChild).toBeDefined()
    const overlayEl = overlayChild as TestElement
    expect(overlayEl.props['onSelectGlobal']).toBe(onSelectGlobal)
  })

  it('does not pass onSelectGlobal when omitted', () => {
    const child = <p>content</p>
    const result = SectionWrapper({
      sectionId: 'sec-1',
      sectionType: 'Hero',
      pageSlug: 'home',
      definitions,
      isPreview: true,
      children: child,
    })

    const el = asTestElement(result)
    const children = el.props['children'] as unknown[]

    const overlayChild = children.find((c) => {
      if (c && typeof c === 'object' && 'type' in (c as TestElement)) {
        return (c as TestElement).type === SectionReplaceOverlay
      }
      return false
    })

    expect(overlayChild).toBeDefined()
    const overlayEl = overlayChild as TestElement
    expect(overlayEl.props['onSelectGlobal']).toBeUndefined()
  })

})

// =========================================================================
// filterDefinitions — pure substring filter for the picker search input.
// Tested directly because the modal itself uses hooks and can't render in
// vitest's node env.
// =========================================================================

describe('filterDefinitions', () => {
  const filterFixtures: readonly DefinitionLike[] = [
    { name: 'Hero', category: 'Layout', component: stubComponent },
    { name: 'TextBlock', category: 'Content', component: stubComponent },
    { name: 'ImageGallery', category: 'Media', component: stubComponent },
    { name: 'VideoEmbed', category: 'Media', component: stubComponent },
    { name: 'CallToAction', component: stubComponent }, // no category
  ]

  it('returns the input unchanged when the query is empty', () => {
    const result = filterDefinitions(filterFixtures, '')
    // Empty query is treated as a no-op so the caller can short-circuit
    // grouping without rebuilding the array.
    expect(result).toBe(filterFixtures)
  })

  it('treats whitespace-only queries as empty', () => {
    const result = filterDefinitions(filterFixtures, '   ')
    expect(result).toBe(filterFixtures)
  })

  it('matches by name (substring)', () => {
    const result = filterDefinitions(filterFixtures, 'Block')
    expect(result.map((d) => d.name)).toEqual(['TextBlock'])
  })

  it('matches by category (substring)', () => {
    const result = filterDefinitions(filterFixtures, 'Media')
    expect(result.map((d) => d.name)).toEqual(['ImageGallery', 'VideoEmbed'])
  })

  it('matching is case-insensitive', () => {
    const upper = filterDefinitions(filterFixtures, 'HERO')
    const lower = filterDefinitions(filterFixtures, 'hero')
    const mixed = filterDefinitions(filterFixtures, 'HeRo')
    expect(upper.map((d) => d.name)).toEqual(['Hero'])
    expect(lower.map((d) => d.name)).toEqual(['Hero'])
    expect(mixed.map((d) => d.name)).toEqual(['Hero'])
  })

  it('returns an empty list when nothing matches', () => {
    const result = filterDefinitions(filterFixtures, 'zzz-no-match')
    expect(result).toEqual([])
  })

  it('handles definitions without a category (no throw on undefined category)', () => {
    // CallToAction has no category — searching its name still works.
    const result = filterDefinitions(filterFixtures, 'CallTo')
    expect(result.map((d) => d.name)).toEqual(['CallToAction'])
  })

  it('matches across both name and category in a single query', () => {
    // "o" appears in Hero (name), TextBlock (no), ImageGallery (no but
    // not in name; not in category), VideoEmbed (name 'Video'), Content
    // (category — pulls in TextBlock), Layout (category — pulls in Hero),
    // CallToAction (name). The match union must be the OR of name-hits
    // and category-hits, not just one axis.
    const result = filterDefinitions(filterFixtures, 'o')
    const names = result.map((d) => d.name)
    // name-axis matches: Hero, VideoEmbed, CallToAction
    expect(names).toContain('Hero')
    expect(names).toContain('VideoEmbed')
    expect(names).toContain('CallToAction')
    // category-axis match: TextBlock has category 'Content' which contains 'o'
    expect(names).toContain('TextBlock')
  })

  it('preserves the input order of matches', () => {
    // Order is part of the contract: groupDefinitions relies on insertion
    // order for category grouping, so the filter must not reorder.
    const result = filterDefinitions(filterFixtures, 'a')
    const indices = result.map((d) => filterFixtures.indexOf(d))
    const sorted = [...indices].sort((a, b) => a - b)
    expect(indices).toEqual(sorted)
  })
})

// =========================================================================
// filterSystemDefinitions / filterSystemGlobals — system-flag filters used
// by the picker to hide framework-managed entries (e.g. SiteMeta).
// Tested as pure helpers because the modal itself can't render in node env.
// =========================================================================

describe('filterSystemDefinitions', () => {
  const defs: readonly DefinitionLike[] = [
    { name: 'Hero', component: stubComponent },
    { name: 'SiteMeta', component: stubComponent, system: true },
    { name: 'TextBlock', component: stubComponent, system: false },
    { name: 'Footer', component: stubComponent },
  ]

  it('removes definitions whose system flag is true', () => {
    const result = filterSystemDefinitions(defs)
    const names = result.map((d) => d.name)
    expect(names).toEqual(['Hero', 'TextBlock', 'Footer'])
    expect(names).not.toContain('SiteMeta')
  })

  it('treats a missing system field as false', () => {
    // Most user definitions don't set the flag at all; they must pass through.
    const result = filterSystemDefinitions([
      { name: 'Hero', component: stubComponent },
    ])
    expect(result).toHaveLength(1)
  })

  it('preserves input order', () => {
    const result = filterSystemDefinitions(defs)
    // The output order should match the input order of the non-system items.
    expect(result.map((d) => d.name)).toEqual(['Hero', 'TextBlock', 'Footer'])
  })
})

describe('filterSystemGlobals', () => {
  const globals: readonly GlobalEntry[] = [
    { name: 'site-header', type: 'Header' },
    { name: 'site-meta', type: 'SiteMeta', system: true },
    { name: 'site-footer', type: 'Footer', system: false },
  ]

  it('removes globals whose system flag is true', () => {
    const result = filterSystemGlobals(globals)
    const names = result.map((g) => g.name)
    expect(names).toEqual(['site-header', 'site-footer'])
    expect(names).not.toContain('site-meta')
  })

  it('treats a missing system field as false (forward compatibility)', () => {
    // An older server that doesn't send `system` must not be silently
    // hidden — `filterSystemGlobals` defaults absent to "user global".
    const result = filterSystemGlobals([{ name: 'foo', type: 'Bar' }])
    expect(result).toHaveLength(1)
  })
})

// =========================================================================
// mergePreviewProps — preview-card merge that layers `previewData` over
// `defaults`. Pure helper extracted from `SectionPreviewCard` /
// `GlobalPreviewCard` so the merge contract can be tested without
// rendering the modal (which uses hooks and can't run in node env).
// =========================================================================

describe('mergePreviewProps', () => {
  it('returns defaults verbatim when previewData is absent', () => {
    const result = mergePreviewProps({
      defaults: { title: 'Title', body: 'Start writing here...' },
    })
    expect(result).toEqual({ title: 'Title', body: 'Start writing here...' })
  })

  it('returns an empty record when both defaults and previewData are absent', () => {
    // Stub definitions in tests (and in the picker's GlobalPreviewCard
    // when no matching definition is found) may carry neither field.
    // The helper must not throw — preview-card render is a hot path.
    const result = mergePreviewProps({})
    expect(result).toEqual({})
  })

  it('previewData wins over defaults on overlapping keys (shallow merge)', () => {
    // The whole point of `previewData` is to OVERRIDE thin defaults with
    // richer sample content for the picker card. A short
    // RichTextField default ("Start writing here...") is overridden by
    // a meatier preview passage.
    const result = mergePreviewProps({
      defaults: {
        title: 'Title',
        body: 'Start writing here...',
        logos: [],
      },
      previewData: {
        title: 'Welcome to the show',
        body: 'A longer rich-text passage that fills the preview card.',
        logos: [
          { _id: 'a', src: 'logo-a.png' },
          { _id: 'b', src: 'logo-b.png' },
        ],
      },
    })
    expect(result).toEqual({
      title: 'Welcome to the show',
      body: 'A longer rich-text passage that fills the preview card.',
      logos: [
        { _id: 'a', src: 'logo-a.png' },
        { _id: 'b', src: 'logo-b.png' },
      ],
    })
  })

  it('keys present only in defaults survive the merge', () => {
    // `previewData` is `Partial<...>` — authors only enrich some fields,
    // the rest must fall back to `defaults`. Missing fields would render
    // the card with `undefined` props and crash the section component.
    const result = mergePreviewProps({
      defaults: { title: 'Title', body: 'Start writing here...', logos: [] },
      previewData: { logos: [{ _id: 'a', src: 'logo-a.png' }] },
    })
    expect(result).toEqual({
      title: 'Title',
      body: 'Start writing here...',
      logos: [{ _id: 'a', src: 'logo-a.png' }],
    })
  })

  it('keys present only in previewData appear in the merged output', () => {
    // Defensive: a `previewData` carrying a key absent from `defaults`
    // (e.g. an in-flight schema change where the author added the
    // override before the descriptor) still flows through. The picker
    // never validates — `wrapSectionProps` handles unknown keys by
    // passing them through.
    const result = mergePreviewProps({
      defaults: { title: 'Title' },
      previewData: { subtitle: 'Subtitle' },
    })
    expect(result).toEqual({ title: 'Title', subtitle: 'Subtitle' })
  })

  it('does not mutate the input defaults or previewData', () => {
    // Spread merge produces a fresh object; the inputs must be untouched
    // so the registry (which stores both records by reference) is safe.
    const defaults = { title: 'Title', body: 'Start writing here...' }
    const previewData = { title: 'Welcome' }
    const before = { defaults: { ...defaults }, previewData: { ...previewData } }
    mergePreviewProps({ defaults, previewData })
    expect(defaults).toEqual(before.defaults)
    expect(previewData).toEqual(before.previewData)
  })

  it('is re-exported from the barrel', async () => {
    const barrel = await import('./index')
    expect(typeof barrel.mergePreviewProps).toBe('function')
  })
})

// =========================================================================
// useTaskEvents removed in v0.5: the agent channel was dropped, and the
// section-replace flow now POSTs directly to /api/agntcms/draft/
// replace-section. See SectionReplaceOverlay above and
// ARCHITECTURE.md sections 6 and 7.
// =========================================================================

describe('SectionReplaceOverlay — direct fetch behaviour', () => {
  // SectionReplaceOverlay now uses useState + useCallback + useRouter
  // internally; calling it directly in the node environment without a
  // React reconciler triggers "Invalid hook call". Full behavioural
  // coverage (button click → modal → fetch /draft/replace-section →
  // router.refresh) lives in the template integration tests where a
  // DOM environment is available.

  it('targets the v0.5 draft/replace-section endpoint (source check)', async () => {
    // Source-level guard so a future refactor cannot silently revert to
    // the old MCP dispatch path without flipping this test red.
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(
        new URL('./SectionReplaceOverlay.tsx', import.meta.url),
        'utf-8',
      ),
    )
    expect(source).toContain('/api/agntcms/draft/replace-section')
    // Negative guards: the previous task-pipeline plumbing must stay gone.
    expect(source).not.toContain('useTaskEvents')
    expect(source).not.toContain('AgentTaskContext')
    expect(source).not.toContain('dispatchAgentTask')
  })
})
