import { describe, it, expect } from 'vitest'
import { deriveHandlerDeps } from './derive'
import type { ResolvedConfig } from './defineConfig'
import type { AnySectionDefinition } from '../sections/defineSection'

// Build a minimal `AnySectionDefinition`. The handler derivations only
// look at `name`, `defaults`, and `system`; the rest is filler so the
// type checks pass without dragging in real schemas/components.
function section(
  name: string,
  defaults: Record<string, unknown>,
  system?: boolean,
): AnySectionDefinition {
  return {
    name,
    schema: {},
    component: (() => null) as unknown as AnySectionDefinition['component'],
    defaults,
    ...(system !== undefined ? { system } : {}),
  }
}

function config(sections: readonly AnySectionDefinition[]): ResolvedConfig {
  return {
    sections,
    // Adapters are not consulted by `deriveHandlerDeps`. Cast to silence
    // the structural-typing check without pulling FS adapter scaffolding
    // into a pure-function test.
    contentAdapter: {} as ResolvedConfig['contentAdapter'],
    assetAdapter: {} as ResolvedConfig['assetAdapter'],
  }
}

describe('deriveHandlerDeps', () => {
  it('derives all three collections from a mixed system/non-system config', () => {
    const cfg = config([
      section('Hero', { title: 'Hi' }),
      section('SiteMeta', { siteName: '' }, true),
      section('Footer', { copyright: '' }),
    ])

    const deps = deriveHandlerDeps(cfg)

    expect(Array.from(deps.allowedTypes).sort()).toEqual([
      'Footer',
      'Hero',
      'SiteMeta',
    ])
    expect(deps.sectionDefaults.get('Hero')).toEqual({ title: 'Hi' })
    expect(deps.sectionDefaults.get('SiteMeta')).toEqual({ siteName: '' })
    expect(deps.sectionDefaults.get('Footer')).toEqual({ copyright: '' })
    expect(Array.from(deps.systemTypes)).toEqual(['SiteMeta'])
  })

  it('treats system: undefined and system: false as non-system', () => {
    // Both branches of the absent/false guard must collapse to the same
    // empty system set — this is what prevents accidental flagging when a
    // section author forgets to set the flag.
    const cfg = config([
      section('A', {}),
      section('B', {}, false),
    ])

    const deps = deriveHandlerDeps(cfg)

    expect(deps.systemTypes.size).toBe(0)
    // Sanity: allowedTypes still contains both — the system filter must
    // not have leaked into the broader allowedTypes derivation.
    expect(Array.from(deps.allowedTypes).sort()).toEqual(['A', 'B'])
  })
})
