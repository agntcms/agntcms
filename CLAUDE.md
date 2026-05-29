# agntcms

A single-process framework for building sites on Next.js with an inline content-editing UI. The Next.js application owns rendering, content storage, and admin endpoints — there is no second process and no agent channel. The stack is frozen: Next.js only. Deploy is a regular Next.js project (Vercel by default — no containers). The admin/preview UI is a dev-time tool; production deploys are read-only. A developer's local Claude Code can optionally load skills from `.claude/skills/` to scaffold sections and manage pages, but the framework does not require it. See `@ARCHITECTURE.md`.

Stage: v0.5 — channel/agent infrastructure removed in lockstep. Framework not yet released. No users, breaking changes are fine until the v1.0.0 tag.

## Repository layout

```
packages/
├── next/        # @agntcms/next         runtime, React, route handlers
├── skills/      # @agntcms/skills       Claude Code skills, source of truth for project structure
└── cli/         # create-agntcms-app    (unscoped) — bundles template at build time
template/        # agntcms-template      reference Next.js project
```

All four units are released in lockstep under one version. Dependency graph: `cli → skills`, `template → next, skills`. `next` and `skills` are isolated.

## Commands

- `pnpm dev` parallel watch across all packages
- `pnpm test` vitest across all packages
- `pnpm test packages/next/src/domain` targeted run
- `pnpm typecheck` tsc across all packages, must be green before any commit
- `pnpm build` production build of all packages
- `pnpm template:dev` boot the template as a live sandbox against locally linked packages

## Hard invariants

These rules cannot be broken without an explicit decision from the lead agent and a corresponding update to `@ARCHITECTURE.md`.

1. Dependencies inside `@agntcms/next` flow strictly one way: `domain ← storage ← runtime ← handlers`. `react` depends only on `domain`, on type imports from `runtime`, and on `sections` (types and the slot-wrapping helpers `wrapSectionProps` / `wrapAsSlot` — see ARCHITECTURE.md §7). No cycles.
2. `react` imports nothing from `storage`. Server dependencies must not leak into the client bundle.
3. The subpath exports `@agntcms/next`, `/server`, `/client`, `/handlers`, `/config` are public contract. Change only deliberately, with a breaking-change note.
4. The template directory layout is the public contract of the framework. Skills are its single source of truth. Any change to folder structure or frozen files is a breaking change and requires synchronized updates to `skills` and `template`.
5. The frozen zone in the template (`app/api/agntcms/`, `app/[[...slug]]/`, `app/not-found.tsx`, `app/sitemap.ts`, `app/robots.ts`, `.claude/`) is not user-editable. The admin surface is served by a single catch-all `app/api/agntcms/[...path]/route.dev.ts` (the `.dev.ts` suffix removes it from the production build); the entire admin surface disappears in `next build`. Any feature that requires touching the frozen zone is either a design mistake or a breaking framework change.
6. No codegen, no folder scanning. Section registration is always explicit through `agntcms/config.ts`.
7. KISS and YAGNI. If a feature is not in `@ARCHITECTURE.md` sections 1 through 10, by default it does not exist. The deferred list lives in section 11.

## Working discipline

- **Root cause before fix.** Before editing code to fix a bug, state one explicit hypothesis about the cause and verify it (read the relevant code, check a log, run a focused test). If the hypothesis is not confirmed, do not try another edit "just in case" — form a new hypothesis and verify again. Speculative tweaking is how three wrong fixes land before the real one.
- **No-op verify stops.** On "compare / sync / check that X matches Y" tasks: diff first. If there is no divergence, stop and report "aligned, no changes needed" in one line. Do not expand scope into neighboring files or propose refactors.
- **Stay in the requested directory.** If the user points at a specific path (`temp/`, `packages/next/src/runtime/`, a single file), do not wander up the tree or touch sibling packages without explicit permission.

## Code style

- TypeScript strict, no `any`. `unknown` with explicit narrowing is fine.
- No default exports in library code, named only.
- Domain types live in `packages/next/src/domain` and are not redefined anywhere else.
- Tests sit next to code: `foo.ts` plus `foo.test.ts`. Unit tests for `domain` are mandatory, for `runtime` desirable, for `handlers` covered through integration tests.
- Comments explain **why**, not **what**. Obvious code stays uncommented.

## Agent team

This project uses Claude Code subagents. The user talks **only** to the lead. The lead delegates work to specialist subagents through the Task tool. Each subagent knows its scope and refuses work outside it.

Subagents cannot delegate to other subagents. If a task spans multiple scopes, they return to the lead with a hand-off note, and the lead dispatches the next subagent in a fresh Task call.

### lead (this file)

Role: entry point for the user, routing, review, invariant enforcement, release coordination.

Does directly:
- Architecture and trade-off discussions before any task is dispatched.
- Final review of all changes before they land in main.
- Updates to `@ARCHITECTURE.md` when new decisions are made.
- Workspace infrastructure: workspace config, root scripts, base tsconfig, lockfile management.

Does **not** do directly: feature implementation. Any edit inside `packages/next/`, `packages/skills/`, `packages/cli/`, or `template/` (beyond the workspace skeleton) must be delegated to the appropriate subagent through the Task tool. Self-editing those directories is forbidden, because there is no second reviewer to check invariants if the lead writes the code.

Routing rules:
- Task touches `packages/next/` → `runtime-dev`.
- Task touches `packages/skills/` or the `template/` layout → `skills-dev`.
- Task touches `packages/cli/` or onboarding → `cli-dev`.
- Task crosses several packages → the lead decomposes it, dispatches the parts, then stitches results together.

### runtime-dev

Scope: `packages/next/`. Owner of the domain model, adapters, runtime, React components, route handlers, and public subpath exports.

Must keep in mind:
- The module dependency graph (see invariant 1).
- The dual nature of `getContent` (preview versus prod). This is the most delicate point in the public API and deserves extra care. See `@ARCHITECTURE.md` §6.
- Field types are built in and not user-extensible.
- Versioning is based on full snapshots, not patches.

Does not touch: `packages/skills/`, `packages/cli/`, or the `template/` layout outside of frozen-file edits during a coordinated breaking-change release.

### skills-dev

Scope: `packages/skills/` and the `template/` layout (folder structure, frozen files).

Must keep in mind:
- Skills are the **source of truth** for the canonical structure. The template is its reference implementation. When they diverge, fix the template, not the skills, unless the contract itself is being changed.
- Skills are split into modules by responsibility, so a user can replace an individual skill when plugging in a custom adapter.
- The frozen zone is guarded by skills. A skill must be able to detect when a user has broken a frozen file and explain how to recover.
- Creating a section is exactly two operations: create the folder, and add two lines to config. The skill enforces consistency between them.

Does not touch: `packages/next/`, `packages/cli/`.

### cli-dev

Scope: `packages/cli/`. The most isolated subagent, rarely activated.

Must keep in mind:
- Only one command exists: `create-agntcms-app`. No others.
- The CLI scaffolds the template, installs dependencies, and initializes `.claude/skills/` (by calling `syncSkills` from `@agntcms/skills`). It does not walk the user through deploy credentials — deploy is regular `git push` to a Vercel-connected repo.
- The template is **bundled inside the CLI tarball** at build time (`packages/cli/dist/template/`), not fetched from a git tag or a separate npm package. The build step copies `template/` into `dist/template/` and rewrites `workspace:*` references in `dist/template/package.json` to concrete versions (lockstep guarantees the version matches `@agntcms/next` and `@agntcms/skills` releases).

### Deprecated: mcp-integration

Previously owned `packages/next/src/mcp/`, `packages/next/src/tasks/`, and `template/.claude-plugin/` — the Claude Code channel-server integration. **Removed in v0.5** when the project pivoted to direct inline editing. The agent is kept in the team config as a placeholder; do not dispatch to it unless a deliberate decision is made to reintroduce server-initiated agent channels (which would require an `@ARCHITECTURE.md` update). For any current work, route accordingly: MCP/channel-flavored requests do not apply, and routine UI work goes to `runtime-dev`.

### Reserved slot: content-agent (not active)

Reserved for future work with content fixtures inside `template/` and a future dogfood site. Currently irrelevant: there is no content worth managing through a dedicated agent yet. Do not activate without an explicit user request.

## Commit protocol

Before every commit, bump the version of each modified package (patch unless the user specifies otherwise). All packages are released in lockstep. If unsure which semver level to use, ask the user before committing.

Additional gates:

- `pnpm typecheck && pnpm test` must be green before the commit is created.
- Check `git status` and make sure related changes are staged together — not just `src/`, but also the matching updates to `packages/skills/src/**`, registry indexes, and `template/` when a change crosses those boundaries.
- If the change touches a public contract (subpath exports, template layout, frozen files), the version bump applies to all packages in lockstep and the commit carries a breaking-change note referencing the relevant `@ARCHITECTURE.md` section.

## Task delegation protocol

When the lead delegates, the dispatch must include:
1. One line of context: what and why.
2. Pointers to specific `@ARCHITECTURE.md` sections if the task is architecturally loaded.
3. Explicit invariants that must not be violated, drawn from the list above.
4. A done-criterion: what should turn green (`pnpm typecheck`, specific tests, manual check inside `template:dev`).

When a subagent returns a result, the lead **personally** runs an invariant review before reporting completion to the user.

## Reference documents

- `@ARCHITECTURE.md` is the single authoritative design document. Updates go through the lead only.
