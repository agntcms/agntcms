import { describe, it, expect } from 'vitest'

import {
  Z_PREVIEW_TOOLBAR,
  Z_ADMIN_MODAL,
  Z_ADMIN_SUBMODAL,
  Z_FIELD_EDITOR,
  Z_FIELD_EDITOR_PICKER,
} from './zLayers'

// ---------------------------------------------------------------------------
// zLayers — the ladder ordering IS the contract. The original bug
// (field editors opened behind the AdminModal "Edit global" sub-modal)
// was a single inverted comparison: the field editor sat at 100000 while
// its host sub-modal sat at 100001. These assertions pin the ordering so a
// future value tweak can't silently re-invert it.
// ---------------------------------------------------------------------------

describe('zLayers ladder ordering', () => {
  it('stacks preview toolbar below the admin modal', () => {
    expect(Z_PREVIEW_TOOLBAR).toBeLessThan(Z_ADMIN_MODAL)
  })

  it('stacks admin sub-modals above the main admin modal', () => {
    expect(Z_ADMIN_MODAL).toBeLessThan(Z_ADMIN_SUBMODAL)
  })

  it('stacks field editors ABOVE the admin sub-modal layer (the bug)', () => {
    // The Edit-global sub-modal hosts editable fields at Z_ADMIN_SUBMODAL.
    // A field editor opened from inside it MUST paint on top, otherwise the
    // editor renders behind its own host and editing looks broken.
    expect(Z_FIELD_EDITOR).toBeGreaterThan(Z_ADMIN_SUBMODAL)
  })

  it('stacks satellite pickers one rung above their parent field editor', () => {
    // e.g. the image picker launched from the markdown editor toolbar.
    expect(Z_FIELD_EDITOR_PICKER).toBeGreaterThan(Z_FIELD_EDITOR)
  })
})
