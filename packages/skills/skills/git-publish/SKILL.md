---
name: agntcms-git-publish
user-invocable: true
description: Defines when and how the agent makes git commits for substantial content operations. The user is the primary committer; the agent commits only when the change is significant enough that a meaningful message adds clear value.
---

# agntcms Git and Publishing

Load the `agntcms-structure` skill before this one. This skill explains when and how the
agent makes git commits after significant content operations.

---

## The publishing model

Publishing is a file system operation only: the runtime moves `content/drafts/<slug>.json`
to `content/pages/<slug>.json` and writes a snapshot to `content/history/<slug>/<timestamp>.json`.
That is everything the runtime does.

**The runtime does not commit to git.** After publishing, the content is changed on disk.
The user decides when to commit and push. The typical flow is: make several edits locally
in `pnpm dev`, verify the result, then `git add content/ && git commit && git push` to
trigger a Vercel redeploy.

**The agent may commit** after substantial operations — when it has a meaningful story to
tell in a commit message that the user would not easily reconstruct from `git log`. This is
optional best practice, not a requirement.

---

## When to commit as the agent

Commit after any agent-driven operation that produces a meaningful content checkpoint:

- Multiple pages were modified in a single operation.
- The changes are significant: new page created, major structural rearrangement, full
  content rewrite.

**Do NOT commit** in these cases:
- Small field edits that will go through the draft/publish UI flow. The user decides when
  to publish; they will commit when they are ready.
- Changes to `agntcms/sections/` or `agntcms/config.ts`. These are code changes and
  belong in a developer commit, not a content commit.
- When the user did not ask for a commit and the changes are minor.

The rule of thumb: if the change is substantial enough that someone reading `git log` would
want to know it happened and why, commit it. If it is routine draft editing that will be
published via the UI shortly, skip the agent commit.

---

## How to commit as the agent

```bash
git add content/
git commit -m "descriptive message about what changed and why"
```

Two rules that are not negotiable:
1. **Only stage `content/`**. Never `git add .` or `git add -A`. Staging everything risks
   accidentally committing code changes, secrets, or build artifacts.
2. **Write a meaningful commit message**. Your message should tell a human what happened
   and why — the user cannot reconstruct that from a generic message.

### Commit message conventions

Structure: what changed + why (if the reason was given or is obvious from context).

Good messages:
- `Replace Hero with TextBlock on home page (user requested simpler layout)`
- `Rewrite About page: updated company description and team bios`
- `Add Products page with three product showcase sections`
- `Update home hero title and CTA copy for spring campaign`

Poor messages (do not write these):
- `Updated files`
- `Content changes`
- `agntcms: section replace`
- `Task done`

The commit message is visible in the admin UI's version history and in `git log`. Make it
informative enough that the user can understand the change without opening the diff.

---

## Graceful degradation

If git is not configured or is unavailable, content edits still take effect on disk. The
draft files are written; the `content/` changes are real. Only the version checkpoint in
git is missing.

Do not fail the content task because git failed. Complete the content change, then separately
warn the user that the git commit failed and why. This keeps the content operation successful
and the git configuration issue visible.

Example warning:
```
Replaced section hero-1 from Hero to TextBlock on page home. Warning: git commit failed —
git identity not configured. The draft was written; run 'git add content/ && git commit'
manually once git is configured.
```

If `git commit` fails because `user.email` or `user.name` is not set, tell the user to
configure their git identity:

```bash
git config user.email "you@example.com"
git config user.name "Your Name"
```

Do NOT set git identity yourself in code. That is a developer environment concern.

---

## Key rules

1. **Only stage `content/`** — `git add content/`. Never use `git add .` or `git add -A`.
2. **Meaningful commit messages** — explain what changed and why. Avoid generic messages.
3. **Agent commits are optional** — the user is the primary committer. The agent commits
   only when the change is substantial enough that a meaningful message adds clear value.
4. **Do not publish on behalf of the user** — writing a draft and committing it is not the
   same as publishing. Publishing moves the file from `drafts/` to `pages/` and writes
   history.
5. **Git failure does not fail the content task** — degrade gracefully and warn the user.
6. **Do not configure git identity yourself** — that is a developer environment concern.
