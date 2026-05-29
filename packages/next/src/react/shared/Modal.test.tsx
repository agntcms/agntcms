import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'

import { Modal } from './Modal'

// ---------------------------------------------------------------------------
// Test helper — same pattern as SectionRenderer.test.tsx (T-015).
// Needed because React 19's ReactElement<P = unknown> makes .props opaque.
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
// Modal — outer wrapper behaviour
//
// Modal is split into an outer wrapper (hook-free) and an inner ModalBody
// (holds hooks). This lets us call Modal({ open: false }) directly in
// vitest's node environment: the `!open` path returns null BEFORE any
// hook is called. The `open` path returns a <ModalBody> element
// descriptor without invoking the body function.
// ---------------------------------------------------------------------------

describe('Modal (closed)', () => {
  it('returns null when open is false', () => {
    const result = Modal({ open: false, onClose: () => {}, title: 'x', children: 'y' })
    expect(result).toBeNull()
  })

  it('does not call onClose when closed', () => {
    const onClose = vi.fn()
    Modal({ open: false, onClose, title: 'x', children: 'y' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Modal (open) — delegates to inner body', () => {
  it('returns a ModalBody element when open', () => {
    const result = Modal({ open: true, onClose: () => {}, title: 'x', children: 'y' })
    expect(result).not.toBeNull()
    const el = asTestElement(result as React.ReactElement)
    // The outer wrapper returns <ModalBody {...props} />. ModalBody is a
    // function (we don't export it, but that's fine — we just check
    // that the element type is a function component).
    expect(typeof el.type).toBe('function')
  })

  it('forwards all props through to the inner body', () => {
    const onClose = vi.fn()
    const title = createElement('h2', null, 'Title')
    const children = createElement('p', null, 'Body')
    const footer = createElement('button', null, 'Save')

    const result = Modal({
      open: true,
      onClose,
      title,
      children,
      footer,
      maxWidth: 500,
      maxHeight: '70vh',
      zIndex: 12345,
      ariaLabel: 'Edit thing',
      contentPadding: 10,
    })

    const el = asTestElement(result as React.ReactElement)
    expect(el.props['open']).toBe(true)
    expect(el.props['onClose']).toBe(onClose)
    expect(el.props['title']).toBe(title)
    expect(el.props['children']).toBe(children)
    expect(el.props['footer']).toBe(footer)
    expect(el.props['maxWidth']).toBe(500)
    expect(el.props['maxHeight']).toBe('70vh')
    expect(el.props['zIndex']).toBe(12345)
    expect(el.props['ariaLabel']).toBe('Edit thing')
    expect(el.props['contentPadding']).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Behavioural aspects (Escape dismissal, backdrop click, panel rendering,
// footer rendering, body-scroll lock on mount / restore on unmount) live
// inside ModalBody, which uses hooks. Those paths cannot be unit-tested in
// vitest's node environment — the same constraint documented for
// SectionReplaceOverlay and SectionPickerModal. Their correctness is
// exercised through the two callers (MarkdownEditorModal, SectionPickerModal)
// and validated manually in the template sandbox.
// ---------------------------------------------------------------------------

describe('Modal — module shape', () => {
  it('exports Modal as a function', () => {
    expect(typeof Modal).toBe('function')
  })
})
