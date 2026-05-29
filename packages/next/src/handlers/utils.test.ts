import { describe, it, expect } from 'vitest'
import { jsonResponse, safeErrorMessage } from './utils'

describe('jsonResponse', () => {
  it('sets status, JSON content-type, and serialises the body', async () => {
    const res = jsonResponse({ ok: true, n: 1 }, 200)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    await expect(res.json()).resolves.toEqual({ ok: true, n: 1 })
  })

  it('merges extraHeaders alongside Content-Type', () => {
    const res = jsonResponse({ ok: true }, 200, { 'Set-Cookie': 'a=1; Path=/' })
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Set-Cookie')).toBe('a=1; Path=/')
  })

  it('behaves as before when extraHeaders is omitted', () => {
    const res = jsonResponse({ error: 'x' }, 400)
    expect(res.status).toBe(400)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    // No other header should be set by the helper.
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })
})

describe('safeErrorMessage', () => {
  it('extracts Error.message', () => {
    expect(safeErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns the string itself when the value is a string', () => {
    expect(safeErrorMessage('nope')).toBe('nope')
  })

  it('falls back to "unknown error" for other shapes', () => {
    expect(safeErrorMessage({})).toBe('unknown error')
    expect(safeErrorMessage(null)).toBe('unknown error')
    expect(safeErrorMessage(undefined)).toBe('unknown error')
    expect(safeErrorMessage(42)).toBe('unknown error')
  })
})
