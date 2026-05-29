// Unit test for `defaults-registry`'s missing-slot error path.
//
// Why this test exists: the slot is normally pre-populated by side effect
// when the server barrel (`/server`) or the `config/index.ts` internal
// barrel is imported, both of which call `installDefaultAdapterFactories()`.
// Every other test in this package imports through one of those paths, so
// the missing-slot branch in `getDefaultAdapterFactories` was never
// exercised. A future refactor that moves the install-call could silently
// break the error path; this test pins it.
//
// We import ONLY `./defaults-registry` (NOT `./index` or `../server`) so
// the install side effect does not run. The slot is process-wide
// (`Symbol.for`-keyed on `globalThis`), so we save and restore it across
// the test to avoid leaking into sibling tests in the same vitest worker.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getDefaultAdapterFactories,
  registerDefaultAdapterFactories,
  type DefaultAdapterFactories,
} from './defaults-registry'

// Same key the registry uses internally. Re-derived here rather than
// imported as a constant: we want this test to fail loudly if the slot
// key is renamed without updating the test, since that would also break
// every consumer that reads the slot.
const SLOT = Symbol.for('@agntcms/next/default-adapter-factories')

interface SlotHolder {
  [SLOT]?: DefaultAdapterFactories
}

describe('defaults-registry: missing-slot error path', () => {
  let savedSlot: DefaultAdapterFactories | undefined

  beforeEach(() => {
    // Capture whatever was registered before (sibling tests / prior side
    // effects may have populated it) and clear so the missing-slot
    // branch can be exercised.
    const holder = globalThis as unknown as SlotHolder
    savedSlot = holder[SLOT]
    delete holder[SLOT]
  })

  afterEach(() => {
    // Restore — sibling tests in the same vitest worker rely on the
    // slot being populated.
    const holder = globalThis as unknown as SlotHolder
    if (savedSlot === undefined) {
      delete holder[SLOT]
    } else {
      holder[SLOT] = savedSlot
    }
  })

  it('throws when the slot is empty, naming the requested adapter', () => {
    expect(() => getDefaultAdapterFactories('content')).toThrow(
      /default content adapter/,
    )
    expect(() => getDefaultAdapterFactories('asset')).toThrow(
      /default asset adapter/,
    )
  })

  it('error message points at importing /server or /handlers', () => {
    try {
      getDefaultAdapterFactories('content')
      expect.fail('expected getDefaultAdapterFactories to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const message = (err as Error).message
      expect(message).toContain('@agntcms/next/server')
      expect(message).toContain('@agntcms/next/handlers')
    }
  })

  it('returns the registered factories after registerDefaultAdapterFactories', () => {
    // Synthesize a sentinel factory set — no need to actually instantiate
    // an FS adapter for this test; we only verify the slot round-trips.
    const sentinel = {
      content: () => ({ __sentinel: 'content' }) as never,
      asset: () => ({ __sentinel: 'asset' }) as never,
    } satisfies DefaultAdapterFactories

    registerDefaultAdapterFactories(sentinel)

    expect(getDefaultAdapterFactories('content')).toBe(sentinel)
  })
})
