---
name: agntcms-update-skills
user-invocable: true
description: Updates the project's .claude/skills/ to the latest framework version by running pnpm update @agntcms/skills && pnpm exec agntcms-skills-sync.
---

# agntcms Update Skills

Brings the project's `.claude/skills/` directory up to date with the latest
published version of the `@agntcms/skills` npm package. The sync is
non-destructive: custom skill folders whose names are not part of the standard
bundle are left untouched.

---

## Triggers

Run this skill when the user says any of:

- "обнови скиллы"
- "update skills"
- "подтяни последние скиллы agntcms"
- "refresh agntcms skills"
- "sync skills"
- "обнови agntcms"
- any paraphrase indicating they want the skill files refreshed

---

## Steps

### 1. Detect the package manager

Check for lockfiles in the project root (the directory you were opened in):

| Lockfile present | Package manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm |
| None of the above | npm (default) |

### 2. Ensure @agntcms/skills is installed

Check whether `@agntcms/skills` appears in `node_modules/.bin/agntcms-skills-sync`
(a quick `ls node_modules/.bin/agntcms-skills-sync` via Bash tool is sufficient).

If not found, install it first:

| Package manager | Install command |
|---|---|
| pnpm | `pnpm add -D @agntcms/skills` |
| yarn | `yarn add -D @agntcms/skills` |
| npm | `npm install -D @agntcms/skills` |

### 3. Update to the latest version

Run the update command:

| Package manager | Update command |
|---|---|
| pnpm | `pnpm update @agntcms/skills` |
| yarn | `yarn upgrade @agntcms/skills` |
| npm | `npm update @agntcms/skills` |

### 4. Run the sync

| Package manager | Sync command |
|---|---|
| pnpm | `pnpm exec agntcms-skills-sync` |
| yarn | `yarn agntcms-skills-sync` |
| npm | `npx agntcms-skills-sync` |

Capture the stdout of this command — it contains the count and version.

### 5. Report to the user

Parse the sync output line (format: `Synced N skills from @agntcms/skills@X.Y.Z`)
and report back in the same language the user used:

- How many skills were synced
- Which version they are now on
- Whether any custom skills were preserved (check if `.claude/skills/` contains
  folders whose names are not in the standard list below)

**Standard skill slugs** (as of the version you are installing — the actual list
comes from the package, but these are the current known slugs):

`content-fs`, `create-page`, `delete-page`, `frozen-guard`, `git-publish`,
`globals`, `init`, `page-create-brief`, `page-edit`, `publish-draft`,
`rename-slug`, `reorder-sections`, `rollback`, `section-edit`, `section-new`,
`section-replace`, `section-validate`, `sections`, `structure`, `text-edit`,
`unpublish-page`, `update-skills`

Any folder in `.claude/skills/` whose name is NOT in that list is a custom skill
and should be mentioned as preserved.

---

## What NOT to do

- Do NOT edit any `SKILL.md` files by hand. The sync command overwrites them
  from the published npm package.
- Do NOT use `git checkout` to restore skills — the files may be outdated
  relative to the current npm version.
- Do NOT touch `node_modules/` directly.
- Do NOT delete `.claude/skills/` and recreate it — the sync is designed to
  overwrite only the bundled slugs, so custom skills survive.

---

## Optional: also update the runtime

If the user also wants to update `@agntcms/next`, that is a separate operation:

```
pnpm update @agntcms/next
```

Mention this as an option when reporting completion, but do not run it unless
the user explicitly asks.
