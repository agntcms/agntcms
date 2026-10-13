import { createHash } from 'node:crypto'
import { readdir, readFile, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'

// Git blob from the last canonical init skill, before replacement in 65b340d.
export const retiredSkills = { init: '5eee766a9c212b663217eb201d2488ef125d625e' } as const

export async function retireUnmodifiedSkill(root: string, slug: string, expectedBlob: string): Promise<boolean> {
  const directory = path.join(root, slug)
  let entries: string[]
  try { entries = await readdir(directory) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  // Extra files or edited content mean this is a customized skill: preserve it.
  if (entries.length !== 1 || entries[0] !== 'SKILL.md') return false
  const file = path.join(directory, 'SKILL.md')
  const content = Buffer.from((await readFile(file, 'utf8')).replace(/\r\n/g, '\n'))
  const blob = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
  if (blob !== expectedBlob) return false
  await unlink(file)
  await rmdir(directory)
  return true
}
