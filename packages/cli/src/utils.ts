import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import * as path from 'node:path'

/**
 * Detect which package manager the user has available, in priority order:
 * 1. Lock file in current working directory (user's project context)
 * 2. Which binary is available on PATH
 * Fallback: pnpm, matching the monorepo default.
 */
export function detectPackageManager(): 'pnpm' | 'npm' | 'yarn' {
  const cwd = process.cwd()

  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(path.join(cwd, 'package-lock.json'))) return 'npm'

  // No lock file found — probe the PATH
  if (commandExists('pnpm')) return 'pnpm'
  if (commandExists('yarn')) return 'yarn'

  return 'npm'
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function installCommand(pm: 'pnpm' | 'npm' | 'yarn'): string {
  switch (pm) {
    case 'pnpm':
      return 'pnpm install'
    case 'yarn':
      return 'yarn install'
    case 'npm':
      return 'npm install'
  }
}
