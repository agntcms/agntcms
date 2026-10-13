import { afterEach, describe, expect, it, vi } from 'vitest'
import { withagntcms } from './withagntcms'
afterEach(() => vi.unstubAllEnvs())
describe('production content tracing', () => {
  it('includes published content and excludes private state even with a broad user include', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const result = withagntcms({
      outputFileTracingIncludes: { '/**': ['./content/**/*'], '/api/contact': ['./mail/**/*'] },
      outputFileTracingExcludes: { '/**': ['./private/**/*'] },
    })
    expect(result.outputFileTracingIncludes['/**']).toEqual([
      './content/**/*', './content/pages/**/*', './content/globals/**/*',
    ])
    expect(result.outputFileTracingIncludes['/api/contact']).toEqual(['./mail/**/*'])
    expect(result.outputFileTracingExcludes['/**']).toEqual([
      './private/**/*', './content/drafts/**/*', './content/global-drafts/**/*',
      './content/history/**/*', './content/history-globals/**/*',
    ])
    expect(result.pageExtensions).not.toContain('dev.ts')
  })
  it('keeps drafts available to the development server', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const result = withagntcms({})
    expect(result.outputFileTracingIncludes['/**']).toEqual(['./content/**/*'])
    expect(result.outputFileTracingExcludes).toEqual({})
    expect(result.pageExtensions).toContain('dev.ts')
  })
  it('preserves custom extensions and does not mutate caller configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const config = { pageExtensions: ['tsx', 'mdx'], outputFileTracingIncludes: { '/**': ['./data/**/*'] } }
    expect(withagntcms(config).pageExtensions).toEqual(['tsx', 'mdx'])
    expect(config.outputFileTracingIncludes['/**']).toEqual(['./data/**/*'])
  })
})
