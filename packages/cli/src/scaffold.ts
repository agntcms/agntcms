import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { syncSkills } from '@agntcms/skills'
import { detectPackageManager, installCommand } from './utils.js'
import { CLI_VERSION } from './version.js'

/**
 * Files and directories to exclude when copying the template.
 * These are build artifacts and workspace-internal files that must not
 * land in a scaffolded project.
 */
const COPY_EXCLUDES = new Set([
  '.next',
  '.turbo',
  'node_modules',
  'tsconfig.tsbuildinfo',
  'next-env.d.ts', // next generates this on first dev run
])

/**
 * The template's package.json uses workspace:* references that are only
 * valid inside this monorepo. When scaffolding, replace them with real
 * version strings. The version comes from the CLI's own package.json
 * (lockstep release: all four units share one version).
 */
const WORKSPACE_PACKAGE_VERSION_MAP: Record<string, string> = {
  '@agntcms/next': CLI_VERSION,
  '@agntcms/skills': CLI_VERSION,
}

export interface ScaffoldOptions {
  /** Link to local monorepo packages via file: protocol (dev only). */
  local?: boolean
}

/**
 * Scaffold a new agntcms project into `targetDir`.
 *
 * Steps:
 * 1. Validate target directory (must not already exist as a non-empty dir).
 * 2. Copy template into target.
 * 3. Rewrite package.json: project name, workspace:* → real versions or file: refs.
 * 4. Install dependencies.
 * 5. Populate .claude/skills/ from @agntcms/skills.
 * 6. Print next-steps.
 */
export async function scaffold(targetDir: string, options: ScaffoldOptions = {}): Promise<void> {
  const absoluteTarget = path.resolve(targetDir)
  const projectName = path.basename(absoluteTarget)
  const local = options.local ?? false

  validateTarget(absoluteTarget)

  const templateDir = resolveTemplateDir()

  // Resolve monorepo root early so we can fail fast if --local is set but
  // the CLI is not running from inside the agntcms source tree.
  const monorepoRoot = local ? resolveMonorepoRoot() : undefined

  console.log(`\nScaffolding agntcms project into ${absoluteTarget} ...\n`)

  copyTemplate(templateDir, absoluteTarget)
  rewritePackageJson(absoluteTarget, projectName, { local, monorepoRoot })
  rewriteTsconfig(absoluteTarget, { local, monorepoRoot })
  writePnpmWorkspace(absoluteTarget)

  // Build monorepo packages first so that file: references in the scaffolded
  // project always resolve to a fresh dist/. Skipping this causes hard-to-debug
  // "module not found" errors when dist/ is absent or stale after a branch switch.
  if (local && monorepoRoot !== undefined) {
    console.log(`Building monorepo packages for --local mode (${monorepoRoot}) ...\n`)
    execSync('pnpm build', { cwd: monorepoRoot, stdio: 'inherit' })
  }

  const pm = detectPackageManager()
  console.log(`Installing dependencies with ${pm} ...\n`)
  execSync(installCommand(pm), { cwd: absoluteTarget, stdio: 'inherit' })

  console.log('Initializing .claude/skills/ ...\n')
  await syncSkills(absoluteTarget)

  // The template ships .claude/skills/.gitkeep so git tracks the empty folder.
  // Now that syncSkills has populated the directory, the placeholder is redundant.
  const gitkeep = path.join(absoluteTarget, '.claude', 'skills', '.gitkeep')
  if (fs.existsSync(gitkeep)) {
    fs.rmSync(gitkeep)
  }

  printNextSteps(projectName, pm, { local, monorepoRoot })
}

function validateTarget(absoluteTarget: string): void {
  if (!fs.existsSync(absoluteTarget)) {
    return // Target does not exist yet — fine.
  }

  const stat = fs.statSync(absoluteTarget)
  if (!stat.isDirectory()) {
    throw new Error(`${absoluteTarget} already exists and is not a directory.`)
  }

  // .git is allowed — the user may have pre-initialized git and wants to keep
  // that history. Any other entry is treated as a collision.
  const entries = fs.readdirSync(absoluteTarget).filter((e) => e !== '.git')
  if (entries.length > 0) {
    throw new Error(
      `Directory ${absoluteTarget} already exists and is not empty. ` +
        `Please choose an empty directory or a new path.`,
    )
  }
}

/**
 * Locate the template directory relative to this package.
 *
 * In the monorepo (development), the template lives at
 * `<repo-root>/template/`. In a published npm tarball the template is
 * bundled inside `dist/template/` alongside the built JS.
 *
 * Resolution order (first that exists wins):
 * 1. `<cli-package-root>/template/`   — published artefact
 * 2. `<cli-package-root>/../../template/` — monorepo layout
 */
function resolveTemplateDir(): string {
  // __dirname is not available in ESM; resolve relative to this file's
  // location using import.meta.url instead, injected at build time by tsup.
  // fileURLToPath is necessary on Windows: URL.pathname returns "/C:/..." with a
  // leading slash that confuses path.resolve on drives other than the CWD drive.
  const here = path.dirname(fileURLToPath(import.meta.url))

  const candidates = [
    path.resolve(here, 'template'),
    path.resolve(here, '..', 'template'),
    path.resolve(here, '..', '..', '..', 'template'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate
    }
  }

  throw new Error(
    `Cannot locate template directory. Searched:\n` +
      candidates.map((c) => `  ${c}`).join('\n'),
  )
}

/**
 * Resolve the agntcms monorepo root for --local mode.
 *
 * Walks up from the CLI's own location to find the directory that contains
 * `packages/next/package.json`. This verifies we are running from inside the
 * agntcms source tree rather than from a published npm package.
 *
 * The CLI lives at `<root>/packages/cli/dist/index.mjs` at runtime, so
 * `<here>/../../..` resolves to the repo root.
 */
function resolveMonorepoRoot(): string {
  // fileURLToPath for the same Windows reason as in resolveTemplateDir.
  const here = path.dirname(fileURLToPath(import.meta.url))
  // dist/ is one level below packages/cli/, which is one level below repo root.
  const candidate = path.resolve(here, '..', '..', '..')
  const marker = path.join(candidate, 'packages', 'next', 'package.json')

  if (fs.existsSync(marker)) {
    return candidate
  }

  throw new Error(
    `Cannot find monorepo root. --local only works when running from the ` +
      `agntcms source tree.\n` +
      `Looked for: ${marker}`,
  )
}

function copyTemplate(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  copyDir(src, dest)
}

function copyDir(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    if (COPY_EXCLUDES.has(entry.name)) continue

    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      // _gitignore was renamed from .gitignore in bundle-template.mjs to survive
      // npm's automatic stripping of .gitignore from published tarballs. Restore
      // the real name so the scaffolded project gets a working .gitignore.
      const destName = entry.name === '_gitignore' ? '.gitignore' : entry.name
      const renamedDestPath = path.join(dest, destName)
      fs.copyFileSync(srcPath, renamedDestPath)
    }
    // Symlinks intentionally skipped — template has none.
  }
}

interface RewriteOptions {
  local: boolean
  monorepoRoot: string | undefined
}

function rewritePackageJson(
  projectDir: string,
  projectName: string,
  opts: RewriteOptions,
): void {
  const pkgPath = path.join(projectDir, 'package.json')

  if (!fs.existsSync(pkgPath)) {
    // Scaffold without a package.json — unusual but not fatal.
    return
  }

  const raw = fs.readFileSync(pkgPath, 'utf-8')
  const pkg: unknown = JSON.parse(raw)

  if (!isRecord(pkg)) {
    throw new Error(`package.json in template is not a JSON object.`)
  }

  // Set project name to the directory name.
  pkg['name'] = projectName

  // Drop "private": true — scaffolded project is standalone.
  delete pkg['private']

  // Replace workspace:* specifiers in dependencies.
  rewriteWorkspaceDeps(pkg, 'dependencies', opts)
  rewriteWorkspaceDeps(pkg, 'devDependencies', opts)
  rewriteWorkspaceDeps(pkg, 'peerDependencies', opts)

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

/**
 * Map of known agntcms workspace packages to their sub-directory inside the
 * monorepo's `packages/` folder.
 */
const WORKSPACE_PACKAGE_DIR_MAP: Record<string, string> = {
  '@agntcms/next': 'packages/next',
  '@agntcms/skills': 'packages/skills',
}

function rewriteWorkspaceDeps(
  pkg: Record<string, unknown>,
  field: string,
  opts: RewriteOptions,
): void {
  const deps = pkg[field]
  if (!isRecord(deps)) return

  for (const [name, version] of Object.entries(deps)) {
    if (typeof version === 'string' && version.startsWith('workspace:')) {
      if (opts.local && opts.monorepoRoot !== undefined) {
        // In local mode write a file: reference to the monorepo package so
        // the scaffolded project symlinks directly to the built sources.
        const subdir = WORKSPACE_PACKAGE_DIR_MAP[name]
        if (subdir !== undefined) {
          deps[name] = `file:${path.join(opts.monorepoRoot, subdir)}`
          continue
        }
      }
      // Normal mode: use the npm version string from the lockstep release.
      const mapped = WORKSPACE_PACKAGE_VERSION_MAP[name]
      deps[name] = mapped !== undefined ? `^${mapped}` : `^${CLI_VERSION}`
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Rewrite the template's tsconfig.json, which extends "../../tsconfig.base.json"
 * — a relative path valid only inside the monorepo.
 *
 * Normal mode: drop `extends`, inline the base compiler options so the scaffolded
 * project is fully self-contained (no external file dependency at all).
 *
 * Local mode: replace the relative extends path with an absolute path pointing
 * at the monorepo's tsconfig.base.json. This way tsconfig changes in the
 * monorepo propagate automatically to the scaffolded project.
 */
function rewriteTsconfig(projectDir: string, opts: RewriteOptions): void {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json')

  if (!fs.existsSync(tsconfigPath)) {
    return
  }

  const raw = fs.readFileSync(tsconfigPath, 'utf-8')
  const tsconfig: unknown = JSON.parse(raw)

  if (!isRecord(tsconfig)) return

  const extendsValue = tsconfig['extends']
  // Only rewrite if the extends points to the monorepo base config.
  if (typeof extendsValue !== 'string' || !extendsValue.includes('tsconfig.base')) {
    return
  }

  if (opts.local && opts.monorepoRoot !== undefined) {
    // Local mode: replace the relative path with an absolute path to the
    // monorepo base config so the scaffolded project always gets the latest
    // compiler options without needing its own copy.
    tsconfig['extends'] = path.join(opts.monorepoRoot, 'tsconfig.base.json')
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8')
    return
  }

  delete tsconfig['extends']

  // Merge the base compiler options (from tsconfig.base.json) under compilerOptions.
  // These values are stable across the lockstep release — they move only when the
  // monorepo's tsconfig.base.json changes, which is a coordinated breaking change.
  const base: Record<string, unknown> = {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'Bundler',
    resolveJsonModule: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    exactOptionalPropertyTypes: true,
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    useDefineForClassFields: true,
  }

  const existing = isRecord(tsconfig['compilerOptions']) ? tsconfig['compilerOptions'] : {}
  // Existing options (jsx, noEmit, plugins, paths ...) win over base defaults.
  tsconfig['compilerOptions'] = { ...base, ...existing }

  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8')
}

/**
 * Write a pnpm-workspace.yaml into the scaffolded project root.
 *
 * pnpm 10+ no longer reads the legacy `pnpm` field from package.json for
 * build-script approval. The canonical location is now the workspace root's
 * pnpm-workspace.yaml. Without this file pnpm install would emit
 * ERR_PNPM_IGNORED_BUILDS and skip sharp's native postinstall build, breaking
 * Next.js image optimization on the very first `pnpm install`.
 *
 * `allowBuilds` (a map) is the pnpm ≥10.26 successor to the deprecated
 * `onlyBuiltDependencies` array.
 */
export function writePnpmWorkspace(projectDir: string): void {
  const content = [
    '# pnpm reads build-script approval from the workspace root.',
    '# sharp ships a native postinstall build that Next.js image optimization needs.',
    'allowBuilds:',
    '  sharp: true',
    '',
  ].join('\n')

  fs.writeFileSync(path.join(projectDir, 'pnpm-workspace.yaml'), content, 'utf-8')
}

function printNextSteps(
  projectName: string,
  pm: string,
  opts: RewriteOptions,
): void {
  const runCmd = pm === 'npm' ? 'npm run' : pm

  const localNote =
    opts.local && opts.monorepoRoot !== undefined
      ? `\n  Warning: Local mode: dependencies are symlinked to the monorepo at ${opts.monorepoRoot}.\n` +
        `    Run "pnpm dev" in the monorepo to keep packages rebuilt in watch mode.\n`
      : ''

  console.log(`
agntcms project created successfully!
${localNote}
Next steps:

  cd ${projectName}
  ${runCmd} dev            # start the dev server at http://localhost:3000

  ${runCmd} build          # production build (Vercel picks this up automatically)

To configure your project:
  - Edit agntcms/config.ts to register sections and adapters.
  - Add new sections under agntcms/sections/<SectionName>/.

Optional — use Claude Code as a developer assistant:
  - Run \`claude\` in the project directory to open Claude Code.
  - Run /agntcms-init-from-artifact to migrate an existing app generated from a Claude artifact into this project.
  - The .claude/skills/ directory contains developer skills for working with agntcms.
`)
}
