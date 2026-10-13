import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { retireUnmodifiedSkill } from './retired'
const roots: string[] = []
const original = '# Original skill\n'
const digest = createHash('sha1').update(`blob ${Buffer.byteLength(original)}\0${original}`).digest('hex')
async function fixture(content = original) {
  const root = await mkdtemp(path.join(tmpdir(), 'agntcms-retired-'))
  roots.push(root)
  await mkdir(path.join(root, 'init'))
  await writeFile(path.join(root, 'init', 'SKILL.md'), content)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
describe('retiring canonical skills', () => {
  it('removes only the known unmodified skill, including a Windows checkout', async () => {
    const root = await fixture(original.replace(/\n/g, '\r\n'))
    expect(await retireUnmodifiedSkill(root, 'init', digest)).toBe(true)
    await expect(access(path.join(root, 'init'))).rejects.toThrow()
    expect(await retireUnmodifiedSkill(root, 'init', digest)).toBe(false)
  })
  it('preserves edited content', async () => {
    const root = await fixture('# My custom init\n')
    expect(await retireUnmodifiedSkill(root, 'init', digest)).toBe(false)
    expect(await readFile(path.join(root, 'init', 'SKILL.md'), 'utf8')).toBe('# My custom init\n')
  })
  it('preserves folders with additional user files', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'init', 'notes.md'), 'User notes')
    expect(await retireUnmodifiedSkill(root, 'init', digest)).toBe(false)
  })
})
