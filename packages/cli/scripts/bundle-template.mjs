/**
 * Copies <repo-root>/template/ into <cli-pkg>/dist/template/ at build time.
 *
 * Run after tsup completes (wired via onSuccess in tsup.config.ts).
 * template/package.json is copied verbatim — workspace:* specifiers are left
 * intact so that scaffold.ts::rewriteWorkspaceDeps can handle both rewrite paths
 * at scaffold time: concrete ^<version> in normal mode, file: refs in --local mode.
 * Pre-rewriting here would strip the workspace: marker before the runtime rewrite
 * runs, breaking --local mode.
 *
 * The script is intentionally self-contained (no non-stdlib deps) so it runs
 * without a prior install step.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// scripts/ is one level below packages/cli/
const cliPkgRoot = path.resolve(__dirname, '..')
// packages/cli/ is two levels below repo root
const repoRoot = path.resolve(cliPkgRoot, '..', '..')
const templateSrc = path.join(repoRoot, 'template')
const templateDest = path.join(cliPkgRoot, 'dist', 'template')

/**
 * Top-level names to skip entirely during the copy.
 * These are artifacts, build outputs, and env files that must not ship.
 */
const EXCLUDE_NAMES = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  'tsconfig.tsbuildinfo',
  'next-env.d.ts',
])

/**
 * Filename patterns that are excluded regardless of their directory.
 * Checked by suffix or exact match.
 */
const EXCLUDE_SUFFIXES = ['.log']
const EXCLUDE_EXACT = new Set(['.env', '.env.local'])
const EXCLUDE_PREFIXES = ['.env.']

/**
 * Content subdirectories whose *contents* are excluded from the bundle.
 * The directory itself is created empty in the scaffolded project so the
 * expected folder structure exists from the first run. These directories
 * contain only runtime-populated files (.gitkeep placeholders in the repo)
 * and must not ship any content.
 *
 * Note: content/pages and content/globals are NOT in this set — they carry
 * demo JSON files that ship with the scaffolded project so users see working
 * content immediately.
 *
 * Paths are relative to templateSrc and use forward slashes as separator.
 */
const EMPTY_CONTENT_DIRS = new Set([
  'content/drafts',
  'content/history',
  'content/history-globals',
  'content/submissions',
])

function shouldExcludeByName(name) {
  if (EXCLUDE_NAMES.has(name)) return true
  if (EXCLUDE_EXACT.has(name)) return true
  for (const suffix of EXCLUDE_SUFFIXES) {
    if (name.endsWith(suffix)) return true
  }
  for (const prefix of EXCLUDE_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }
  return false
}

/**
 * Recursively copy src → dest, applying exclusions.
 *
 * @param {string} src  Absolute path to source directory.
 * @param {string} dest Absolute path to destination directory.
 * @param {string} relPath Slash-separated path relative to templateSrc, used
 *   to detect content directories that should be emptied.
 */
function copyDir(src, dest, relPath) {
  fs.mkdirSync(dest, { recursive: true })

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    if (shouldExcludeByName(entry.name)) continue

    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      if (EMPTY_CONTENT_DIRS.has(childRelPath)) {
        // Create the directory but leave it empty (no .gitkeep — the content
        // directories get populated at scaffold time, and .gitkeep is not needed
        // in the bundled template since we create these dirs unconditionally).
        fs.mkdirSync(destPath, { recursive: true })
        // Skip the recursive copy — we only want the empty folder.
        continue
      }
      copyDir(srcPath, destPath, childRelPath)
    } else if (entry.isFile()) {
      // npm strips .gitignore from published tarballs (documented npm behavior).
      // Rename to _gitignore so it survives the pack; scaffold.ts renames it back.
      const destName = entry.name === '.gitignore' ? '_gitignore' : entry.name
      const renamedDestPath = path.join(dest, destName)
      fs.copyFileSync(srcPath, renamedDestPath)
    }
    // Symlinks are intentionally skipped — template has none.
  }
}

// --- main ---

if (!fs.existsSync(templateSrc)) {
  console.error(`bundle-template: template source not found: ${templateSrc}`)
  process.exit(1)
}

// Clean the destination so stale files from a previous build do not linger.
if (fs.existsSync(templateDest)) {
  fs.rmSync(templateDest, { recursive: true, force: true })
}

console.log(`bundle-template: copying ${templateSrc} → ${templateDest}`)
copyDir(templateSrc, templateDest, '')
console.log('bundle-template: done')
