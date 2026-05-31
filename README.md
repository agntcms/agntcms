<div align="center">

# agntcms

**Built on Next.js. Powered by Claude. Owned by you.**

An opinionated, AI-native CMS framework — a headless CMS for content sites where
your agent is the primary interface, not a third-party client bolted onto someone
else's dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-000.svg)](LICENSE)
[![Next.js 15+](https://img.shields.io/badge/Next.js-15+-000.svg)](https://nextjs.org)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-000.svg)](https://claude.com/claude-code)

[Manifesto](https://agntcms.com/manifesto) · [Docs](https://agntcms.com/docs) · [Roadmap](https://agntcms.com/docs/fyi/roadmap) · [Blog](https://agntcms.com/blog)

</div>

---

## What it is

agntcms is a Next.js framework for content sites driven by Claude Code Desktop.
Inside is a working headless CMS — drafts, version history, asset management, an
inline-edit UI, section replace — plus a set of Claude Code skills the agent uses
to drive all of it end-to-end.

You talk to Claude; Claude calls the skills; the skills call the framework; the
preview refreshes. **Skills first, files second, agent at the centre.**

Take everything headless CMS got right for content sites, throw out the rest, and
sit the whole thing on Claude Code as the primary interface.

## Why

Every major headless CMS now ships "AI" — but the agent is a third-party client
calling an API designed for a human editor. Schemas, queries, permissions,
editorial workflow — all of it predates the agent.

**agntcms inverts the architecture.** The agent is the primary actor in the
system; the human plugs in through it, not around it. Skills are first-class API;
the inline-edit UI is the secondary surface for *clicks*, not the primary one for
*intent*.

The economics follow. MIT-licensed, self-hosted, no per-seat pricing. No
48-content-type ceiling, no locale paywall, no $40K/year for 50 editors. Deployed
as a normal Next.js app — headless-grade capability at the cost of the runtime you
were already paying for.

This is for the **90%** of content sites — marketing pages, landing pages,
corporate resources, content portals — that have been overpaying for an
omnichannel architecture they never used. *Not* for 50-person editorial teams with
five-tier approval flows; that case stays with traditional headless.

The full argument is in the [manifesto](https://agntcms.com/manifesto) — *From
Headless to Agent-Native*.

## Quickstart

The path agntcms is designed around is a Claude Code conversation, not a CLI dance.

**1.** Open **[Claude Code Desktop](https://claude.com/claude-code)** in an empty folder.

**2.** Send Claude this message (replace `my-site` with your project name):

```
Create a new project based on the agntcms framework — https://agntcms.com.
Project name: my-site.
```

Claude reads the site, runs the scaffolding command, installs dependencies, and
syncs the skills from `@agntcms/skills` into `.claude/skills/`. When it is done you
have a running demo — roughly thirty section types and a handful of content pages —
*and* a directory Claude Code already understands.

### Manual fallback

If you want to run the CLI yourself, it is the same command Claude would run:

```bash
npx create-agntcms-app@latest my-site
cd my-site
pnpm dev
```

You still need Claude Code for everything after this — it is not optional, just
deferred.

## What you get out of the box

- **A working Next.js + headless-CMS template.** Standard App Router. Running demo
  in two minutes.
- **Drafts and version history.** Every edit lands in `content/drafts/<slug>.json`
  first; publishing moves it to `content/pages/<slug>.json` and writes a timestamped
  snapshot to `content/history/<slug>/`. Rollback is one skill call. Drafts are
  committed to git, so switching machines or handing off never loses work.
- **Asset management.** Files live under `public/assets/<sha256>.<ext>`. Filenames
  are content hashes — identical uploads deduplicate automatically and cache
  invalidation is free.
- **Inline-edit UI.** Toggle preview mode and every editable text and image gains a
  hover outline. Click to edit in place; drop back into Claude Code for bigger jobs.
- **Section replace.** Each section has a swap action that hands the slot to a
  different section type and fills in sensible defaults from the new schema.
- **22 Claude Code skills (`@agntcms/skills`).** One skill per operation — create
  page, edit a single field, replace a section, publish, roll back, rename a slug,
  scaffold a new section type, migrate from a Claude Design bundle. The agent picks
  the skill from the task; you do not memorise names.
- **A frozen production build.** Admin, inline-edit UI, and the agent channel are
  all stripped from production via `.dev.ts` route suffixes. Visitors get a plain,
  fast Next.js app with no AI runtime dependency.

## Project structure

An agntcms project is a normal Next.js project with three zones. The boundary
between them decides whether the next framework update applies cleanly or turns
into a three-day merge.

| Zone | Path | Who edits |
|---|---|---|
| **User** | `agntcms/`, `styles/`, `BRAND.md`, `app/sitemap.ts`, `app/robots.ts`, Next.js configs | developer, sometimes the agent through skills |
| **Content** | `content/`, `public/assets/` | editor and the agent through skills (not by hand) |
| **Frozen** | `app/api/agntcms/`, `app/[[...slug]]/`, `app/not-found.tsx`, `.claude/settings.json`, `.claude/skills/` | no one (version bumps only) |

A section type lives under `agntcms/sections/<Name>/` (`index.ts`, `schema.ts`,
`component.tsx`) and is registered with two lines in `agntcms/config.ts` —
registration is always explicit.

## Stack

Three pieces, all required, none configurable — a deliberate choice, so the agent
can sit deeper than any plugin could.

- **Next.js (15+).** Your site is a normal App Router project. Deploy anywhere
  Next.js runs.
- **`@agntcms/next` and `@agntcms/skills`.** The runtime — domain model, storage
  adapters, React components, HTTP handlers — and the agent's skills. Both ship in
  lockstep; update them together.
- **Claude Code Desktop.** The primary editing surface. Without it, the framework
  is just Next.js — no agent, no skills, no AI-native flow.

Requirements: **Node.js ≥ 20**, **pnpm ≥ 9**, **git**.

## Documentation

Full docs live at **[agntcms.com/docs](https://agntcms.com/docs)**.

- [What is agntcms](https://agntcms.com/docs) — the core idea
- [Install](https://agntcms.com/docs/fun/install) → [Explore the demo](https://agntcms.com/docs/fun/explore-demo) → [Setup a personalised project](https://agntcms.com/docs/fun/setup-personalised-project)
- [Concepts](https://agntcms.com/docs/core/concepts) and [Architecture](https://agntcms.com/docs/core/architecture)
- [Project structure](https://agntcms.com/docs/core/project-structure) · [Creating sections](https://agntcms.com/docs/core/creating-sections) · [Skills](https://agntcms.com/docs/core/skills)

## About this repository

This is the source for agntcms itself — a pnpm + Turborepo monorepo. `packages/`
holds the three published packages: `@agntcms/next` (the runtime), `@agntcms/skills`
(the Claude Code skills), and `create-agntcms-app` (the scaffolding CLI). `template/`
is the reference project the CLI generates from. Build everything with `pnpm build`
and run the template locally with `pnpm template:dev`.

## Roadmap

Deliberately short — v1 just shipped, and the rest will be shaped by what people
actually run into.

- **Next:** a proper Postgres adapter — drafts, history, and admin endpoints behaving
  exactly as on the filesystem adapter, with no changes to section code or skills.
- **After that — TBD** by community and release feedback.

See the [full roadmap](https://agntcms.com/docs/fyi/roadmap).

## Contributing

agntcms is open source and the diagnosis behind it is a public argument. If it
matched your experience, there is a concrete way to participate:

- **Open an issue** for a concrete edge you hit in a real project.
- **Start a discussion** for design questions and patterns worth pulling into the framework.
- **Send a PR.**

Every open task and comment moves the next item on the roadmap.

## License

[MIT](LICENSE). A framework, not a service — self-hosted, no per-seat pricing, no
vendor lock-in.
