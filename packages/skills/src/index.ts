/**
 * Typed registry of all @agntcms/skills modules.
 *
 * The CLI (T-039) iterates this list to copy each SKILL.md into the user
 * project's .claude/skills/ directory during scaffolding.
 *
 * Skills are split one-per-responsibility so a user plugging in a custom
 * adapter can replace only the relevant skill (e.g. content-fs) without
 * touching the others. See ARCHITECTURE.md §2 and §5.
 *
 * The `path` field is relative to the package root so it stays valid whether
 * the consumer reads from the published npm package (dist/skills/) or from
 * the source tree (skills/).
 */

import { readdir, readFile, cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface SkillModule {
  /** Human-readable name, matches the `name` field in the SKILL.md frontmatter. */
  readonly name: string
  /** One-line description, matches the `description` field in SKILL.md frontmatter. */
  readonly description: string
  /** Directory name under skills/ — used as the target subdirectory in .claude/skills/. */
  readonly slug: string
  /** Path to SKILL.md relative to the package root (works for both src and dist trees). */
  readonly path: string
}

export const agntcmsSkills: ReadonlyArray<SkillModule> = [
  {
    name: 'agntcms-init-from-artifact',
    description: 'Migrate an existing app generated from a Claude artifact (real source code + CSS) into an agntcms project, reusing the source styles and markup verbatim and wrapping them in the content model; screenshots used only to verify.',
    slug: 'init-from-artifact',
    path: 'skills/init-from-artifact/SKILL.md',
  },
  {
    name: 'agntcms-structure',
    description: 'Teaches the agent the canonical agntcms project layout — frozen zone, user zone, content zone, config zone — and where sections live. Load this skill before any other agntcms skill.',
    slug: 'structure',
    path: 'skills/structure/SKILL.md',
  },
  {
    name: 'agntcms-sections',
    description: 'Two-step workflow for creating a section: create folder + register in config.ts.',
    slug: 'sections',
    path: 'skills/sections/SKILL.md',
  },
  {
    name: 'agntcms-content-fs',
    description: 'How the agent edits content through native file tools when using the FS adapter.',
    slug: 'content-fs',
    path: 'skills/content-fs/SKILL.md',
  },
  {
    name: 'agntcms-frozen-guard',
    description: 'Detects when a frozen-zone file has been modified by the user and explains how to recover by restoring it from the framework source.',
    slug: 'frozen-guard',
    path: 'skills/frozen-guard/SKILL.md',
  },
  {
    name: 'agntcms-git-publish',
    description: 'Commit conventions for agent-driven complex edits vs. runtime auto-commits on publish.',
    slug: 'git-publish',
    path: 'skills/git-publish/SKILL.md',
  },
  {
    name: 'agntcms-publish-draft',
    description: 'Publish a draft via the framework endpoint; never move files manually.',
    slug: 'publish-draft',
    path: 'skills/publish-draft/SKILL.md',
  },
  {
    name: 'agntcms-create-page',
    description: 'Create an empty page draft and return a preview URL for the editor to start building.',
    slug: 'create-page',
    path: 'skills/create-page/SKILL.md',
  },
  {
    name: 'agntcms-delete-page',
    description: 'Delete a published page via the framework endpoint after explicit editor confirmation.',
    slug: 'delete-page',
    path: 'skills/delete-page/SKILL.md',
  },
  {
    name: 'agntcms-unpublish-page',
    description: 'Take a published page offline while preserving content as a draft. Non-destructive — page can be republished at any time.',
    slug: 'unpublish-page',
    path: 'skills/unpublish-page/SKILL.md',
  },
  {
    name: 'agntcms-rollback',
    description: 'Roll a published page back to a previous version snapshot via the framework endpoint.',
    slug: 'rollback',
    path: 'skills/rollback/SKILL.md',
  },
  {
    name: 'agntcms-rename-slug',
    description: 'Atomically rename a page slug across pages, drafts, and history via the framework endpoint.',
    slug: 'rename-slug',
    path: 'skills/rename-slug/SKILL.md',
  },
  {
    name: 'agntcms-reorder-sections',
    description: 'Reorder sections within a draft page via the framework endpoint with disambiguation support.',
    slug: 'reorder-sections',
    path: 'skills/reorder-sections/SKILL.md',
  },
  {
    name: 'agntcms-section-new',
    description: 'Creates a new section from name and field list: folder, schema, component, config registration.',
    slug: 'section-new',
    path: 'skills/section-new/SKILL.md',
  },
  {
    name: 'agntcms-section-validate',
    description: 'Validates section integrity: file structure, config registration, type consistency, and editability.',
    slug: 'section-validate',
    path: 'skills/section-validate/SKILL.md',
  },
  {
    name: 'agntcms-globals',
    description: 'Globals are site-wide content blocks (header, footer, announcement bar) rendered in app/layout.tsx via GlobalSlot. This skill covers creating, editing, and wiring globals.',
    slug: 'globals',
    path: 'skills/globals/SKILL.md',
  },
  {
    name: 'agntcms-update-skills',
    description: 'Updates .claude/skills/ to the latest framework version via npm.',
    slug: 'update-skills',
    path: 'skills/update-skills/SKILL.md',
  },
] as const

export interface SyncResult {
  readonly count: number
  readonly version: string
}

/**
 * Copies every skill from this package's dist/skills/ into `<targetDir>/.claude/skills/`.
 *
 * Idempotent: overwrites existing files by the same slug; never deletes folders
 * whose slug is absent from the bundle (custom user skills are preserved).
 *
 * Designed to be called both by the CLI at scaffold time and by the
 * `agntcms-skills-sync` bin at update time, so the copy logic lives here once.
 */
export async function syncSkills(targetDir: string): Promise<SyncResult> {
  // Resolve the package root from this module's location at runtime.
  // dist/index.js is one level below dist/, which is one level below the package root.
  const distDir = path.dirname(fileURLToPath(import.meta.url))
  const pkgRoot = path.dirname(distDir)
  const srcSkillsDir = path.join(pkgRoot, 'dist', 'skills')
  const dstSkillsDir = path.join(targetDir, '.claude', 'skills')

  // Read version from own package.json for the completion log message.
  const pkgJsonPath = path.join(pkgRoot, 'package.json')
  const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as { version: string }
  const version = pkgJson.version

  // Enumerate slug subdirectories inside dist/skills/.
  const entries = await readdir(srcSkillsDir, { withFileTypes: true })
  const slugs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  let count = 0
  for (const slug of slugs) {
    const srcFile = path.join(srcSkillsDir, slug, 'SKILL.md')
    const dstSlugDir = path.join(dstSkillsDir, slug)
    const dstFile = path.join(dstSlugDir, 'SKILL.md')
    await mkdir(dstSlugDir, { recursive: true })
    await cp(srcFile, dstFile)
    count++
  }

  return { count, version }
}
