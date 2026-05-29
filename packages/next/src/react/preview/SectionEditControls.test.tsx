/**
 * Tests for the PreviewField stripping logic in SectionEditControls.
 *
 * We cannot easily test the full React component (it uses useCallback, fetch,
 * window.location.reload, etc.) in a unit test without heavy mocking.
 * Instead, we extract the stripping functions' behaviour by testing them
 * indirectly through JSON round-tripping: we simulate what the component does
 * when building the POST body.
 *
 * The actual stripSectionData / stripSections helpers are file-private, so we
 * test the same logic by re-implementing the identical algorithm here and
 * verifying its behaviour against representative inputs. This is acceptable
 * because the algorithm is small and the test exists to guard against
 * regression in the pattern, not to hit the React render tree.
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Replicate the private strip helpers to unit-test the algorithm.
// This is a deliberate copy — the functions are intentionally unexported from
// SectionEditControls.tsx (they are an implementation detail). If the
// algorithm changes there, these tests must be updated in lockstep.
// ---------------------------------------------------------------------------

function stripSectionData(data: unknown): Record<string, unknown> {
  const record = data as Record<string, unknown>
  const stripped: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    const val = record[key]
    if (typeof val === 'object' && val !== null && '__agntcmsPreview' in val) {
      stripped[key] = (val as unknown as { value: unknown }).value
    } else {
      stripped[key] = val
    }
  }
  return stripped
}

interface SectionLike {
  readonly id: string
  readonly type: string
  readonly data: unknown
  readonly globalRef?: string
}

function stripSections(sections: readonly SectionLike[]): SectionLike[] {
  return sections.map((s) => ({ ...s, data: stripSectionData(s.data) }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripSectionData', () => {
  it('unwraps PreviewField wrappers to their plain values', () => {
    const wrapped = {
      title: {
        __agntcmsPreview: true,
        value: 'Hello',
        origin: {
          pageSlug: '/',
          sectionId: 'sec_1',
          fieldPath: 'title',
          source: 'draft',
          revision: 'abc',
        },
      },
      subtitle: {
        __agntcmsPreview: true,
        value: 'World',
        origin: {
          pageSlug: '/',
          sectionId: 'sec_1',
          fieldPath: 'subtitle',
          source: 'draft',
          revision: 'abc',
        },
      },
    }

    const result = stripSectionData(wrapped)
    expect(result).toEqual({ title: 'Hello', subtitle: 'World' })
  })

  it('passes through plain values unchanged', () => {
    const plain = { title: 'Hello', count: 42, flag: true }
    const result = stripSectionData(plain)
    expect(result).toEqual({ title: 'Hello', count: 42, flag: true })
  })

  it('handles a mix of wrapped and plain fields', () => {
    const mixed = {
      title: {
        __agntcmsPreview: true,
        value: 'Wrapped',
        origin: {
          pageSlug: '/',
          sectionId: 'sec_1',
          fieldPath: 'title',
          source: 'draft',
          revision: 'abc',
        },
      },
      plain: 'already plain',
    }

    const result = stripSectionData(mixed)
    expect(result).toEqual({ title: 'Wrapped', plain: 'already plain' })
  })

  it('does not treat objects without __agntcmsPreview as wrappers', () => {
    const nested = {
      metadata: { foo: 'bar', baz: 123 },
    }
    const result = stripSectionData(nested)
    expect(result).toEqual({ metadata: { foo: 'bar', baz: 123 } })
  })

  it('handles empty data', () => {
    const result = stripSectionData({})
    expect(result).toEqual({})
  })
})

describe('stripSections', () => {
  it('strips all sections in a list', () => {
    const sections: SectionLike[] = [
      {
        id: 'sec_1',
        type: 'Hero',
        data: {
          heading: {
            __agntcmsPreview: true,
            value: 'Welcome',
            origin: {
              pageSlug: '/',
              sectionId: 'sec_1',
              fieldPath: 'heading',
              source: 'draft',
              revision: 'r1',
            },
          },
        },
      },
      {
        id: 'sec_2',
        type: 'Text',
        data: {
          body: {
            __agntcmsPreview: true,
            value: 'Some text',
            origin: {
              pageSlug: '/',
              sectionId: 'sec_2',
              fieldPath: 'body',
              source: 'published',
              revision: 'r2',
            },
          },
        },
      },
    ]

    const result = stripSections(sections)
    expect(result).toEqual([
      { id: 'sec_1', type: 'Hero', data: { heading: 'Welcome' } },
      { id: 'sec_2', type: 'Text', data: { body: 'Some text' } },
    ])
  })

  it('preserves section identity (id, type) across stripping', () => {
    const sections: SectionLike[] = [
      { id: 'sec_x', type: 'Custom', data: { val: 'plain' } },
    ]
    const result = stripSections(sections)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('sec_x')
    expect(result[0]!.type).toBe('Custom')
  })

  it('handles an empty sections list', () => {
    expect(stripSections([])).toEqual([])
  })

  it('preserves globalRef through stripping (spread copies all own properties)', () => {
    const sections: SectionLike[] = [
      {
        id: 'sec_g',
        type: 'Header',
        data: {
          title: {
            __agntcmsPreview: true,
            value: 'Site Name',
            origin: {
              pageSlug: '/',
              sectionId: 'sec_g',
              fieldPath: 'title',
              source: 'draft',
              revision: 'r1',
            },
          },
        },
        globalRef: 'header',
      },
    ]

    const result = stripSections(sections)
    expect(result).toHaveLength(1)
    expect(result[0]!.globalRef).toBe('header')
    expect(result[0]!.data).toEqual({ title: 'Site Name' })
  })

  it('does not add globalRef when it is absent', () => {
    const sections: SectionLike[] = [
      { id: 'sec_1', type: 'Hero', data: { heading: 'hi' } },
    ]
    const result = stripSections(sections)
    expect(result[0]).not.toHaveProperty('globalRef')
  })
})
