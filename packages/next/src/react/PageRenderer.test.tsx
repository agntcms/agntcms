import { describe, it, expect } from 'vitest'
import type { Page, Section } from '../domain/index'
import type { AnySectionDefinition } from '../sections/index'
import { SectionRenderer } from './SectionRenderer'
import { PageRenderer } from './PageRenderer'

// Same test helper as in SectionRenderer.test.tsx — narrows ReactElement
// so we can read `.type`, `.props`, `.key` without React 19 unknown-props noise.
interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

function StubHero(props: { title: string }): React.ReactElement {
  return <h1>{props.title}</h1>
}

function StubFooter(props: { text: string }): React.ReactElement {
  return <footer>{props.text}</footer>
}

const definitions: readonly AnySectionDefinition[] = [
  { name: 'Hero', schema: {}, component: StubHero as unknown as (props: never) => unknown, defaults: {} },
  { name: 'Footer', schema: {}, component: StubFooter as unknown as (props: never) => unknown, defaults: {} },
]

function makePage(slug: string, sections: readonly Section[]): Page {
  return { slug, seo: { title: slug, description: slug }, sections }
}

describe('PageRenderer', () => {
  it('renders all sections in order', () => {
    const page = makePage('home', [
      { id: 's1', type: 'Hero', data: { title: 'Welcome' } },
      { id: 's2', type: 'Footer', data: { text: 'bye' } },
    ])

    const el = asTestElement(PageRenderer({ page, definitions }))

    // Wrapper div with data attribute.
    expect(el.type).toBe('div')
    expect(el.props['data-agntcms-page']).toBe('home')

    // Children should be an array of SectionRenderer elements.
    const children = el.props['children'] as TestElement[]
    expect(children).toHaveLength(2)

    expect(children[0]!.type).toBe(SectionRenderer)
    expect(children[0]!.key).toBe('s1')
    expect(children[0]!.props['section']).toEqual({
      id: 's1',
      type: 'Hero',
      data: { title: 'Welcome' },
    })

    expect(children[1]!.type).toBe(SectionRenderer)
    expect(children[1]!.key).toBe('s2')
    expect(children[1]!.props['section']).toEqual({
      id: 's2',
      type: 'Footer',
      data: { text: 'bye' },
    })
  })

  it('renders wrapper div with no children when sections is empty', () => {
    const page = makePage('empty', [])

    const el = asTestElement(PageRenderer({ page, definitions }))

    expect(el.type).toBe('div')
    expect(el.props['data-agntcms-page']).toBe('empty')

    // Empty array from .map().
    const children = el.props['children'] as TestElement[]
    expect(children).toHaveLength(0)
  })

  it('passes definitions through to each SectionRenderer', () => {
    const page = makePage('test', [
      { id: 's1', type: 'Hero', data: { title: 'hi' } },
    ])

    const el = asTestElement(PageRenderer({ page, definitions }))
    const children = el.props['children'] as TestElement[]
    expect(children[0]!.props['definitions']).toBe(definitions)
  })
})
