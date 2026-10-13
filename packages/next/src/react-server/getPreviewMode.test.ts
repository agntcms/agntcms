import { afterEach, describe, expect, it, vi } from 'vitest'
const { cookies, get } = vi.hoisted(() => ({ cookies: vi.fn(), get: vi.fn() }))
vi.mock('next/headers', () => ({ cookies }))
import { getPreviewMode } from './getPreviewMode'

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })
describe('getPreviewMode', () => {
  it('ignores a forged preview cookie in production without reading request cookies', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    get.mockReturnValue({ value: '1' })
    cookies.mockResolvedValue({ get })
    expect(await getPreviewMode()).toBe('published')
    expect(cookies).not.toHaveBeenCalled()
  })
  it('uses the shared preview flag in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    get.mockReturnValue({ value: '1' })
    cookies.mockResolvedValue({ get })
    expect(await getPreviewMode()).toBe('preview')
    expect(get).toHaveBeenCalledWith('__agntcms_preview')
  })
  it('supports a custom cookie and defaults to published', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    get.mockReturnValue(undefined)
    cookies.mockResolvedValue({ get })
    expect(await getPreviewMode({ cookieName: 'custom-preview' })).toBe('published')
    expect(get).toHaveBeenCalledWith('custom-preview')
  })
})
