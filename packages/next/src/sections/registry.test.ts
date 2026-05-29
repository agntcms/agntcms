import { describe, it, expect, expectTypeOf } from 'vitest'
import { TextField, ImageField } from '../domain/fields'
import type { ImageValue } from '../domain/fields'
import { defineSection } from './defineSection'
import type { EditableSlot } from './defineSection'
import {
  buildSectionRegistry,
  DuplicateSectionNameError,
  type SectionRegistry,
} from './registry'

// The registry is pure data: take an ordered list, produce an immutable
// lookup. Tests lock the contract around duplicates, lookup, iteration order,
// and immutability.
//
// Component prop shapes are slot-typed because `FieldDataType<TextField>`
// is now `EditableSlot<'text', string>` and `FieldDataType<ImageField>` is
// `EditableSlot<'image', ImageValue>` — see EDITABILITY_DESIGN.md.

const Hero = defineSection({
  name: 'Hero',
  schema: { title: TextField, image: ImageField },
  component: (_props: {
    title: EditableSlot<'text', string>
    image: EditableSlot<'image', ImageValue>
  }): null => null,
})

const VideoIntro = defineSection({
  name: 'VideoIntro',
  schema: { title: TextField },
  component: (_props: { title: EditableSlot<'text', string> }): null => null,
})

describe('buildSectionRegistry', () => {
  it('returns a registry that looks up definitions by name', () => {
    const registry = buildSectionRegistry([Hero, VideoIntro])

    expect(registry.get('Hero')).toBe(Hero)
    expect(registry.get('VideoIntro')).toBe(VideoIntro)
    expect(registry.has('Hero')).toBe(true)
    expect(registry.has('VideoIntro')).toBe(true)
  })

  it('get returns undefined on a miss (caller decides the policy)', () => {
    const registry = buildSectionRegistry([Hero])
    // Deliberately NOT throwing — the runtime's SectionRenderer (T-016)
    // will surface a friendly "unknown section type" message.
    expect(registry.get('Nope')).toBeUndefined()
    expect(registry.has('Nope')).toBe(false)
  })

  it('preserves insertion order in definitions', () => {
    const registry = buildSectionRegistry([VideoIntro, Hero])
    expect(registry.definitions.map((d) => d.name)).toEqual([
      'VideoIntro',
      'Hero',
    ])
  })

  it('throws DuplicateSectionNameError when two definitions share a name', () => {
    const HeroTwin = defineSection({
      name: 'Hero',
      schema: { title: TextField },
      component: (_props: { title: EditableSlot<'text', string> }): null => null,
    })

    expect(() => buildSectionRegistry([Hero, HeroTwin])).toThrowError(
      DuplicateSectionNameError,
    )
    try {
      buildSectionRegistry([Hero, HeroTwin])
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateSectionNameError)
      if (err instanceof DuplicateSectionNameError) {
        expect(err.sectionName).toBe('Hero')
      }
    }
  })

  it('accepts an empty list (no sections registered yet)', () => {
    const registry = buildSectionRegistry([])
    expect(registry.definitions.length).toBe(0)
    expect(registry.has('anything')).toBe(false)
  })

  it('returns a frozen registry object (no post-build mutation)', () => {
    const registry = buildSectionRegistry([Hero])
    expect(Object.isFrozen(registry)).toBe(true)
  })

  it('SectionRegistry is the public shape returned by the builder', () => {
    const registry = buildSectionRegistry([Hero])
    expectTypeOf(registry).toMatchTypeOf<SectionRegistry>()
  })
})
