---
name: agntcms-update-skills
user-invocable: true
description: Upgrade runtime and skills to one exact published version, then sync canonical skills while preserving custom folders.
---

# agntcms Update Skills

Use when asked to update agntcms or refresh its skills. Runtime and skills are released
in lockstep; do not independently update one to a different version.

1. Identify the package manager from the project's lockfile and read the installed
   versions of `@agntcms/next` and `@agntcms/skills`.
2. Resolve the requested version, or the latest published runtime version. Verify
   that the same version of `@agntcms/skills` is published before editing anything.
   Read release notes for frozen-file migrations.
3. Install both packages at that exact version, preserving runtime as a dependency
   and skills as a dev dependency:

   | Manager | Runtime | Skills |
   |---|---|---|
   | pnpm | `pnpm add -E @agntcms/next@X.Y.Z` | `pnpm add -DE @agntcms/skills@X.Y.Z` |
   | npm | `npm install --save-exact @agntcms/next@X.Y.Z` | `npm install -D --save-exact @agntcms/skills@X.Y.Z` |
   | yarn | `yarn add --exact @agntcms/next@X.Y.Z` | `yarn add -D --exact @agntcms/skills@X.Y.Z` |

4. Run the installed sync bin (`pnpm exec agntcms-skills-sync`,
   `npm exec agntcms-skills-sync`, or `yarn agntcms-skills-sync`).
   Canonical files are overwritten. Custom folders survive. The old canonical
   `init` is removed only if it matches the known upstream content and contains
   no additional files; customized retired skills remain for manual review.
5. Verify both installed versions match and run the project's typecheck/build.
   Report the version, sync count, preserved custom/retired skills, and any required
   frozen-file migration. New top-level Claude Code skills may require reloading
   the skills/session; do not claim sync alone activates them.

Do not delete and recreate `.claude/skills/`, edit installed package files, or
use a hardcoded obsolete list to identify custom skills. The installed registry
`agntcmsSkills` is the canonical list (currently 17 modules).
