/**
 * Build script for @agntcms/skills.
 *
 * Three-step build chosen over tsup or shell scripts because:
 *   1. The package has two heterogeneous outputs: compiled TypeScript (via tsc)
 *      and raw Markdown skill files that npm consumers need verbatim.
 *   2. A single script keeps all steps co-located and avoids shell portability
 *      issues across dev environments.
 *   3. tsup would be overkill — the TS surface is a small registry with a bin.
 *
 * Step 1: `tsc` compiles src/ → dist/  (declaration files included via tsconfig)
 * Step 2: copy skills/**\/SKILL.md files into dist/skills/ preserving the
 *         module-slug subdirectory, so CLI code can reference them as
 *         dist/skills/<slug>/SKILL.md.
 * Step 3: inject shebang into dist/bin/sync.js and mark it executable (0o755).
 *         tsc does not support banner injection, so this is done as a post-step.
 */

import { cp, mkdir, readFile, writeFile, chmod } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = __dirname

// Step 1: TypeScript compilation
console.log('Building TypeScript…')
execSync('tsc --project tsconfig.json', { cwd: root, stdio: 'inherit' })

// Step 2: Copy raw skill markdown into dist/skills/ so the npm package ships
// both the compiled registry and the verbatim SKILL.md content.
// The CLI reads from dist/skills/<slug>/SKILL.md at install time.
console.log('Copying skill markdown files…')
const srcSkills = path.join(root, 'skills')
const dstSkills = path.join(root, 'dist', 'skills')
await mkdir(dstSkills, { recursive: true })
await cp(srcSkills, dstSkills, { recursive: true })

// Step 3: Inject shebang into dist/bin/sync.js and mark it executable.
// The shebang is required for `agntcms-skills-sync` to run as a bin entry
// without the user needing to invoke `node` explicitly.
console.log('Finalizing bin/sync.js…')
const syncBin = path.join(root, 'dist', 'bin', 'sync.js')
const syncSrc = await readFile(syncBin, 'utf-8')
await writeFile(syncBin, `#!/usr/bin/env node\n${syncSrc}`, 'utf-8')
await chmod(syncBin, 0o755)

console.log('Build complete.')
