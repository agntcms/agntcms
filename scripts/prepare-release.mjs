#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const packages = ['packages/skills', 'packages/next', 'packages/cli']
const manifests = [...packages, 'template'].map((dir) => readJson(join(root, dir, 'package.json')))
const version = manifests[0].version

if (!/^\d+\.\d+\.\d+$/.test(version) || manifests.some((pkg) => pkg.version !== version)) {
  throw new Error('All four release units must have the same stable version.')
}

// Use the pnpm that started this script, including on Windows, instead of an
// unrelated global installation. No shell quoting is needed for paths.
const pnpmCli = process.env.npm_execpath
if (!pnpmCli || !existsSync(pnpmCli)) {
  throw new Error('Run with: npx --yes pnpm@10.33.2 release:prepare')
}
const pnpmVersion = execFileSync(process.execPath, [pnpmCli, '--version'], { encoding: 'utf8' }).trim()
const expectedManager = readJson(join(root, 'package.json')).packageManager
if (`pnpm@${pnpmVersion}` !== expectedManager) {
  throw new Error(`Use ${expectedManager}; the current package manager is ${pnpmVersion}.`)
}

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
if (status) throw new Error('Commit the release changes before preparing archives; the source tree must be clean.')

const runPnpm = (args, cwd = root) => execFileSync(process.execPath, [pnpmCli, ...args], {
  cwd,
  stdio: 'inherit',
})

const destination = join(root, '.release', `v${version}`)
mkdirSync(destination, { recursive: true })
runPnpm(['--filter=./packages/*', 'build'])

const artifacts = []
for (const dir of packages) {
  const pkg = readJson(join(root, dir, 'package.json'))
  const filename = `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
  const path = join(destination, filename)
  // pnpm converts workspace dependencies to publishable versions in the archive.
  // The committed manifests remain unchanged.
  runPnpm(['pack', '--out', path], join(root, dir))
  const archive = readFileSync(path)
  artifacts.push({
    name: pkg.name,
    version,
    filename,
    integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}`,
    size: archive.length,
  })
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
writeFileSync(join(destination, 'manifest.json'), JSON.stringify({ version, commit, artifacts }, null, 2) + '\n')
console.log(`\nPrepared v${version} in ${destination}. No version was bumped and nothing was published.`)
