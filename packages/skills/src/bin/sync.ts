/**
 * CLI entrypoint for `agntcms-skills-sync`.
 *
 * Copies all skill SKILL.md files from this package's dist/skills/ into the
 * current working directory's .claude/skills/, creating directories as needed.
 * Existing custom skill folders whose names are not in the bundle are left
 * untouched (idempotent, non-destructive).
 *
 * The shebang (`#!/usr/bin/env node`) is injected by build.mjs after tsc
 * compilation, because tsc does not support banner injection.
 */

import { syncSkills } from '../index.js'

const result = await syncSkills(process.cwd())
console.log(`Synced ${result.count} skills from @agntcms/skills@${result.version}`)
