import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { EnterPreviewButton } from './EnterPreviewButton'

// ---------------------------------------------------------------------------
// EnterPreviewButton — structural tests.
//
// The vitest env for @agntcms/next is 'node' (no react-dom, no jsdom).
// We exercise what we can without a render context: the component's
// return-shape contract under each mode + the NODE_ENV gate. The
// load-bearing network behaviour is covered in previewMode.test.ts.
// ---------------------------------------------------------------------------

let originalNodeEnv: string | undefined

describe('EnterPreviewButton', () => {
  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('is exported as a function', () => {
    expect(typeof EnterPreviewButton).toBe('function')
  })

  it('returns null in production builds (NODE_ENV === "production")', () => {
    // The button must not ship to prod — the early return guarantees
    // the body is statically removable by Next.js. Verify the runtime
    // contract here.
    process.env.NODE_ENV = 'production'
    expect(EnterPreviewButton({ mode: 'published' })).toBeNull()
    expect(EnterPreviewButton({ mode: 'preview' })).toBeNull()
  })

  it('returns null in preview mode even in dev (single exit point lives in toolbar)', () => {
    process.env.NODE_ENV = 'development'
    expect(EnterPreviewButton({ mode: 'preview' })).toBeNull()
  })

  it('returns a ReactElement in dev when mode is published', () => {
    process.env.NODE_ENV = 'development'
    const result = EnterPreviewButton({ mode: 'published' })
    expect(result).not.toBeNull()
    // ReactElement carries a `type` of 'button' here (we rendered a
    // native button). Guard the contract — if it ever switches to a
    // wrapper component, this assertion catches the regression.
    expect((result as { type: unknown }).type).toBe('button')
  })
})
