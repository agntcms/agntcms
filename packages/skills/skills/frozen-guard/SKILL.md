---
name: agntcms-frozen-guard
user-invocable: true
description: Detects when a frozen-zone file has been modified by the user and explains how to recover by restoring it from the framework source.
---

# agntcms Frozen-Zone Guard

The frozen zone is a set of files owned by the framework. Users must not edit them; neither
should you. They proxy into `@agntcms/next` internals. Any modification breaks the contract
between the framework and the skills.

Load the `agntcms-structure` skill first for the broader zone model. This skill handles
detection and recovery for frozen-file drift specifically.

---

## Complete frozen file list

The following paths are frozen. Any modification to any of them is a contract violation.

| # | Path | Purpose |
|---|------|---------|
| 1 | `app/[[...slug]]/page.tsx` | Catch-all page proxy — renders all content pages |
| 2 | `app/not-found.tsx` | Framework not-found route — renders the canonical CMS `404` page |
| 3 | `app/api/agntcms/_shared.ts` | Module-level singletons (runtime, previewTokenStore) shared by all API route handlers |
| 4 | `app/api/agntcms/[...path]/route.dev.ts` | Catch-all dispatcher — wires every admin endpoint into one file (dev-only, excluded from prod by withagntcms pageExtensions) |
| 5 | `.claude/settings.json` | Claude Code settings |
| 6 | `.claude/skills/` (all files) | Skills installed by the CLI — not user-managed |

---

## What an unmodified frozen file looks like

There are two frozen route files under `app/api/agntcms/`. Both are framework-owned
and must not be modified.

### `app/api/agntcms/_shared.ts` — singleton module

Holds module-level singletons (`runtime`, `previewTokenStore`, and adapter references) that
survive Next.js HMR re-evaluations via `globalThis` caching. It imports from
`@agntcms/next/server`, `@agntcms/next/handlers`, and `@/agntcms/config`. No other imports
are valid. The file must not be modified.

### `app/api/agntcms/[...path]/route.dev.ts` — catch-all dispatcher

The single dev-only route that wires every admin/agent endpoint into one file. It imports
`createagntcmsRouteHandler` from `@agntcms/next/handlers`, pulls all deps from `_shared`
and `@/agntcms/config`, and exports `{ GET, POST, PUT, DELETE }` from the result. The
`.dev.ts` suffix causes `withagntcms()` to exclude it from production builds via the
`pageExtensions` hook. There are no non-dev routes under `app/api/agntcms/`.

An unmodified catch-all dispatcher:
- Imports ONLY from `@agntcms/next/handlers`, `@/agntcms/config`, and from `_shared`
  (via a relative path ending in `/_shared`).
- Calls exactly one factory: `createagntcmsRouteHandler(...)`.
- Exports exactly `{ GET, POST, PUT, DELETE }` from the factory result.
- Contains a `// FROZEN` comment at the top.

### Tamper detection

A route file has been modified if any of the following are true:

- It imports from anything other than `@agntcms/next/handlers`, `@/agntcms/config`,
  and `_shared` (e.g. importing directly from storage, node built-ins, or user-zone files).
- It contains custom request parsing (`req.json()`, header inspection, etc.) beyond
  delegating to the factory result.
- It contains conditional branches, try/catch, or ad-hoc business logic outside what
  the factory provides.
- It exports symbols not listed above for its pattern (additional named exports, default exports).
- The `// FROZEN` comment is absent (minor signal only — absence is suspicious, not proof).

Similarly, `app/[[...slug]]/page.tsx` is a thin proxy to `PageRenderer` from
`@agntcms/next/client`.

`.claude/settings.json` should contain the `enabledPlugins` entry for the frontend-design
plugin. Extra entries are acceptable, but the `enabledPlugins` entry must not be removed
or altered.

---

## Detection steps

When you suspect a frozen file has drifted, or when performing a pre-task health check:

1. **Confirm existence.** Check that each frozen path exists. A missing frozen file is as
   serious as a modified one — deletion breaks the framework just as badly.

2. **Inspect the route handlers.** Open each file under `app/api/agntcms/`. There are
   exactly two: `_shared.ts` and `[...path]/route.dev.ts`.
   Apply the tamper-detection rules for each pattern (see "What an unmodified frozen file
   looks like" above). Any additional files under this directory are also a violation —
   the frozen zone should contain exactly these two files. A file that mixes imports
   from sources outside its allowed set, or that contains ad-hoc logic beyond the
   framework wire-up, has been modified.

3. **Inspect `app/[[...slug]]/page.tsx` and `app/not-found.tsx`.**
   `app/[[...slug]]/page.tsx` is a thin proxy to `PageRenderer` from `@agntcms/next/client`.
   `app/not-found.tsx` is the framework-owned Next.js not-found route that reads the canonical
   CMS page at slug `404`. Custom rendering logic in either file, or a missing file, is a violation.

4. **Inspect `.claude/settings.json`.** Confirm the `enabledPlugins` entry for the
   frontend-design plugin is present. Other entries coexisting with it are fine.

The following paths are **not** frozen and are expected to exist and change:
- `app/sitemap.ts` — user-editable default; ships as a working sitemap generator but may be freely customized.
- `app/robots.ts` — user-editable default; ships as a working robots.txt generator but may be freely customized.
- `.claude/launch.json` — per-developer harness file (Claude Code preview/dev-server launch config); gitignored; the framework has no opinion on its contents. Create or edit it freely when starting a preview.
- `styles/` (`globals.css`, `theme.css`, `typography.css`) — Tailwind v4 design tokens
- `fonts/` — local font files (Satoshi woff2)
- `postcss.config.mjs` — Tailwind v4 PostCSS integration
- `BRAND.md` — brand guide for design decisions

---

## What to do when you detect a violation

### During normal work

If you notice a frozen file has drifted while working on an unrelated task:

1. **Stop what you are doing** before making any other change.
2. **Warn the user** clearly: name the file, describe what differs from the expected content,
   and explain why this matters (the framework cannot guarantee correct behavior).
3. **Do not attempt to merge or auto-fix.** You do not have the canonical version in context.
   Restoring incorrectly can introduce subtle bugs.
4. **Point the user to the recovery steps** below and ask them to confirm before proceeding.

### When a user asks you to modify a frozen file

Refuse. Explain why the file is frozen and what the correct alternative is:

- If they want to add a new API route: create it under a different path, not under
  `app/api/agntcms/`. The `agntcms/` namespace is reserved for the framework.
- If they want to change how a handler works: the correct place for that change is inside
  `@agntcms/next`, not in the proxy file. This is a framework-level change that requires
  updating the package and re-releasing, not editing the template.

### When a task requires a frozen-file change

This means the task is a framework-level change, not a user-level one. Stop, do not proceed,
and escalate: tell the user that the task requires updating the frozen-zone contract and that
this must go through the framework maintainer (a change to `@agntcms/next` and a
corresponding update to `ARCHITECTURE.md`).

---

## Recovery procedure

1. **Identify the framework version.** Check `package.json` for the `@agntcms/next` version
   (e.g. `"@agntcms/next": "0.1.0"`). The frozen files are defined by the template at that
   version tag.

2. **Locate the canonical template.** The template lives in the agntcms repository under
   `template/`. The matching version tag is `v<version>` (e.g. `v0.1.0`). The canonical
   content for each frozen file is at `template/<relative-path>` at that tag.

3. **Restore the file.** Copy the canonical file from the repository at the matching version
   tag to the project. If only one file is affected, manual copy is safest — it avoids
   overwriting user-zone files.

4. **Full scaffold restore (use with caution).** If multiple frozen files are affected, the
   user can re-run `create-agntcms-app` with `--force` against their existing project
   directory. This restores all frozen files in one step, but will prompt before overwriting
   files in the user zone (`agntcms/config.ts`, section files). Confirm with the user before
   suggesting this path.

5. **Verify the restore.** After restoring, confirm the file matches the expected thin-proxy
   shape described in the detection section above. Then verify `pnpm typecheck` is green.

---

## Key rules

1. **Never edit a frozen file** — not even a "small" fix. Route logic belongs in
   `@agntcms/next/handlers`, not in the proxy.

2. **Deletion is also a violation.** A missing frozen file is treated the same as a modified
   one.

3. **Detection first, then recovery.** Do not attempt recovery until you know exactly which
   files are affected and what changed.

4. **Canonical source is the template at the version tag**, not your memory of what the file
   should contain. Always restore from the actual template source.

5. **Escalate framework changes.** If fulfilling a user request genuinely requires changing a
   frozen file, the request is a framework change. It cannot be done inside the project.
