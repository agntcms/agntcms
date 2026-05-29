import { describe, it, expect } from 'vitest'
import { wrapAsSlot } from '../../sections/index'
import { EditableText } from './EditableText'
import { EditableRichText } from './EditableRichText'
import { renderMarkdown } from './renderMarkdown'

interface TestElement {
  type: unknown
  props: Record<string, unknown>
  key: string | null
}

function asTestElement(el: React.ReactElement): TestElement {
  return el as unknown as TestElement
}

// Step 3 of the marketing-site primitives rollout forked the two
// components: EditableText is plain text, EditableRichText keeps markdown
// rendering. These tests lock that fork.
describe('EditableRichText', () => {
  it('is a distinct component from EditableText (no longer an alias)', () => {
    expect(EditableRichText).not.toBe(EditableText)
  })

  it('renders markdown-derived HTML in published mode (bold)', () => {
    // Tests now pass slot-shaped fixtures: the SectionRenderer hands a
    // slot to every editable component (EDITABILITY_DESIGN.md sub-task 2).
    // `wrapAsSlot` is a thin lift; the inner value is inspected the same
    // way the production renderer hands it.
    const el = asTestElement(EditableRichText({ field: wrapAsSlot('richText', '**bold**') }))
    expect(el.type).toBe('div')
    // The published path uses dangerouslySetInnerHTML to inject the
    // rendered markdown HTML produced by `renderMarkdown`. Match the
    // exact same output so this test stays in lockstep with the
    // renderer's behavior.
    expect(el.props['dangerouslySetInnerHTML']).toEqual({ __html: renderMarkdown('**bold**') })
    // Sanity: the renderer must produce a <strong> tag for **bold**, otherwise
    // the contract this test guards is silently no-op.
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
  })

  it('renders the value in a custom tag via the `as` prop', () => {
    const el = asTestElement(EditableRichText({ field: wrapAsSlot('richText', 'Body'), as: 'p' }))
    expect(el.type).toBe('p')
    expect(el.props['dangerouslySetInnerHTML']).toEqual({ __html: renderMarkdown('Body') })
  })

  it('applies className', () => {
    const el = asTestElement(EditableRichText({ field: wrapAsSlot('richText', 'x'), className: 'rich' }))
    expect(el.props['className']).toBe('rich')
  })

  it('does NOT use plain text children in published mode', () => {
    // Regression guard: if someone unifies the two components later, this
    // assertion will catch the loss of markdown rendering on the rich path.
    const el = asTestElement(EditableRichText({ field: wrapAsSlot('richText', '**bold**') }))
    expect(el.props['children']).toBeUndefined()
    expect(el.props['dangerouslySetInnerHTML']).toBeDefined()
  })
})
