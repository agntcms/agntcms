# Changelog

All notable changes to agntcms are recorded here. Versions are released in lockstep across all published packages: `@agntcms/next`, `@agntcms/skills`, `create-agntcms-app`.

## [0.3.2] — Unreleased

### Fixes

- **Vercel deploys no longer 404 every page.** `@agntcms/next`'s filesystem storage adapter reads `content/*.json` via `fs.readFile` at request time. Nothing `import`s these JSON files, so Next.js was not tracing them into the serverless bundle and `[[...slug]]` returned not-found in production. `withagntcms()` now injects `outputFileTracingIncludes: { '/**': ['./content/**/*'] }` (merged with any user-provided entries), so the content directory ships with the deployed function automatically. See ARCHITECTURE.md §3.

## [0.2.1] — Unreleased

### Fixes

- **Demo content now ships with scaffolded projects.** The CLI's `bundle-template` script in v0.2.0 incorrectly excluded `content/pages/` along with the other runtime-populated content dirs, so newly scaffolded projects had no demo home/blog/about pages. The 9 demo JSON files now ship correctly.
- **Renamed CLI package: `@agntcms/cli` → `create-agntcms-app`.** This matches the standard npm convention (create-vite, create-next-app, create-t3-app). The user-facing command is now `npx create-agntcms-app@latest my-project`. The old `@agntcms/cli@0.2.0` is deprecated on npm with a pointer to the new name.

## [0.2.0] — 2026-05-18

### Breaking

- **Template is no longer fetched from GitHub by tag.** It is now bundled inside the CLI tarball at build time (`dist/template/`). The CLI reads the bundled template at scaffold time. No network fetch, no GitHub rate limits, no tag pinning. The template package itself stays `private: true` and is not published to npm. See ARCHITECTURE.md §2.
- **Removed stale skill copies from `template/.claude/skills/`.** The 21 committed `SKILL.md` files under `template/.claude/skills/<slug>/` had drifted from the canonical source in `packages/skills/skills/`. They have been deleted. The canonical source of truth remains `packages/skills/skills/` (per ARCHITECTURE.md §3 and §10, principle 6).
- **Brand rename: `agentcms` → `agntcms`.** All identifiers, paths, package names, and prose collapsed to the single canonical form `agntcms` (no other variants: no `AgentCMS`, `agent-cms`, or `AGENTCMS`).

### Features

- **`@agntcms/skills` now exposes `agntcms-skills-sync` bin.** Running `pnpm exec agntcms-skills-sync` (or `npx agntcms-skills-sync`) from a project root copies every `SKILL.md` from the installed package into the project's `.claude/skills/`. Idempotent: existing canonical skills are overwritten, custom user skills are preserved.
- **New meta-skill `agntcms-update-skills`.** Teaches the local Claude Code agent how to update skills end-to-end: detect the project's package manager, run `<pm> update @agntcms/skills && <pm> exec agntcms-skills-sync`, and report what changed. Users update skills by telling their local agent "обнови скиллы" / "update skills" — no manual command memorization.
- **Root `pnpm release patch|minor|major` script.** Bumps versions in all four `package.json` files in lockstep, runs `pnpm install` + `pnpm build`, commits, tags. Publishing remains manual (`pnpm --filter='./packages/*' publish --access public`).

### Notes

- **Frozen-zone updates** (`app/api/agntcms/`, `app/[[...slug]]/`, `.claude-plugin/`, `app/sitemap.ts`, `app/robots.ts`, `app/admin/`, etc.) remain manual in this release. When a future release changes any of these files, the release notes will spell out the manual sync procedure (typically: copy the file from `node_modules/create-agntcms-app/dist/template/<path>` over your project's copy). Automating frozen-zone updates is deferred.

[0.2.1]: # "unreleased"
[0.2.0]: # "2026-05-18"
