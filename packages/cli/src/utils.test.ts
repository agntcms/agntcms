import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// We import after the vi.mock calls so that mocked modules are in place.
// Note: `detectPackageManager` has two branches — lock-file and PATH.
// We test both branches by controlling the filesystem.

describe('detectPackageManager', () => {
  let tmpDir: string
  let originalCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agntcms-utils-test-'))
    originalCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns pnpm when pnpm-lock.yaml is present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    const { detectPackageManager } = await import('./utils.js')
    expect(detectPackageManager()).toBe('pnpm')
  })

  it('returns yarn when yarn.lock is present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    const { detectPackageManager } = await import('./utils.js')
    expect(detectPackageManager()).toBe('yarn')
  })

  it('returns npm when package-lock.json is present', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '')
    const { detectPackageManager } = await import('./utils.js')
    expect(detectPackageManager()).toBe('npm')
  })
})

describe('installCommand', () => {
  it('returns correct install commands', async () => {
    const { installCommand } = await import('./utils.js')
    expect(installCommand('pnpm')).toBe('pnpm install')
    expect(installCommand('yarn')).toBe('yarn install')
    expect(installCommand('npm')).toBe('npm install')
  })
})
