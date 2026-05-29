#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Load NPM_TOKEN (and any other simple KEY=VALUE pairs) from .env so that
// the publish step picks up auth without the caller having to `export` it
// manually. The project's .npmrc references `${NPM_TOKEN}` and pnpm/npm
// will only interpolate from process.env, not from .env directly.
// Already-set env vars win, so CI tokens override local .env values.
loadDotenv(resolve(REPO_ROOT, '.env'))

function loadDotenv(path) {
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf-8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || key in process.env) continue
    let value = trimmed.slice(eq + 1).trim()
    // Strip a single layer of surrounding quotes, matching dotenv conventions.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

const PACKAGES = [
  'packages/next/package.json',
  'packages/skills/package.json',
  'packages/cli/package.json',
  'template/package.json',
]

const PUBLISH_DIRS = ['packages/next', 'packages/skills', 'packages/cli']
const PUBLISHED = ['@agntcms/next', '@agntcms/skills', 'create-agntcms-app']

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit', ...opts })
}

function readJson(relPath) {
  const abs = resolve(REPO_ROOT, relPath)
  return { path: abs, data: JSON.parse(readFileSync(abs, 'utf-8')) }
}

function writeJson(absPath, data) {
  writeFileSync(absPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

// Replace any `workspace:*` (or `workspace:^`, etc.) dependency spec with a
// concrete version, in place. `pnpm publish` does this automatically at pack
// time, but we publish with `npm publish` (for reliable token auth — see the
// publish loop below) and plain npm does NOT understand the `workspace:`
// protocol, so the raw spec would leak into the tarball and break `npx`
// (EUNSUPPORTEDPROTOCOL). Returns true if the file was modified.
function rewriteWorkspaceDeps(absPkgPath, version) {
  const data = JSON.parse(readFileSync(absPkgPath, 'utf-8'))
  let changed = false
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = data[field]
    if (!deps) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        deps[name] = version
        changed = true
      }
    }
  }
  if (changed) writeJson(absPkgPath, data)
  return changed
}

function bumpSemver(version, level) {
  const parts = version.split('-')[0].split('.').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid semver: ${version}`)
  }
  const [major, minor, patch] = parts
  if (level === 'major') return `${major + 1}.0.0`
  if (level === 'minor') return `${major}.${minor + 1}.0`
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Unknown level: ${level}`)
}

function main() {
  const level = process.argv[2]
  if (!['patch', 'minor', 'major'].includes(level)) {
    console.error('Usage: pnpm release <patch|minor|major>')
    process.exit(1)
  }

  // Refuse to release on a dirty tree.
  const status = execSync('git status --porcelain', { cwd: REPO_ROOT }).toString().trim()
  if (status.length > 0) {
    console.error('Working tree is not clean. Commit or stash changes first.')
    console.error(status)
    process.exit(1)
  }

  // Gate: typecheck + tests must pass.
  run('pnpm typecheck')
  run('pnpm test')

  // Anchor version: take @agntcms/next current version and bump.
  const next = readJson('packages/next/package.json')
  const newVersion = bumpSemver(next.data.version, level)
  console.log(`\nReleasing v${newVersion} (from @agntcms/next ${next.data.version})`)

  // Bump all four package.json versions.
  for (const rel of PACKAGES) {
    const { path, data } = readJson(rel)
    data.version = newVersion
    writeJson(path, data)
    console.log(`  bumped ${rel} → ${newVersion}`)
  }

  // workspace:* deps are rewritten to the concrete version just before each
  // `npm publish` and restored afterward (see the publish loop). They must stay
  // as `workspace:*` in the committed tree.

  // Refresh lockfile and rebuild.
  run('pnpm install --no-frozen-lockfile')
  run('pnpm build')

  // Commit + tag.
  run('git add -A')
  run(`git commit -m "release: v${newVersion}"`)
  run(`git tag v${newVersion}`)

  // Publish to npm via `pnpm publish`. The project's .npmrc references
  // `${NPM_TOKEN}`, but pnpm/npm don't always interpolate that placeholder
  // reliably across environments — we pass the token to each publish through
  // `npm_config_//registry.npmjs.org/:_authToken=<token>`, which bypasses
  // .npmrc interpolation entirely.
  //
  // Why `pnpm publish` and not `npm publish`: with a granular npm access
  // token (the recommended kind for CI/scripted publishes), `npm publish`'s
  // internal `otplease` path returns 404 even when the token has the right
  // scope, write permission, and 2FA-bypass enabled. `pnpm publish` against
  // the same token / same env-var path publishes cleanly. Observed during
  // the v0.5.0 release; previous releases happened to land before the npm
  // tooling regression. `--no-git-checks` disables pnpm's "branch matches
  // publishBranch" check, which is irrelevant here (we already verified the
  // tree is clean at the start of `main()`).
  if (!process.env.NPM_TOKEN) {
    console.error('NPM_TOKEN is not set (load it via .env or shell). Cannot publish.')
    process.exit(1)
  }
  for (const dir of PUBLISH_DIRS) {
    const pkgPath = resolve(REPO_ROOT, dir, 'package.json')
    const rewritten = rewriteWorkspaceDeps(pkgPath, newVersion)
    try {
      run('pnpm publish --access public --no-git-checks', {
        cwd: resolve(REPO_ROOT, dir),
        env: {
          ...process.env,
          'npm_config_//registry.npmjs.org/:_authToken': process.env.NPM_TOKEN,
        },
      })
    } finally {
      // Restore the committed `workspace:*` source regardless of publish outcome.
      if (rewritten) run(`git checkout -- ${dir}/package.json`)
    }
  }

  console.log(`
Published v${newVersion}: ${PUBLISHED.join(', ')}
(template/ is private and bundled inside create-agntcms-app; not published separately.)

Final step — push commit + tag:

  git push origin main --tags
`)
}

main()
