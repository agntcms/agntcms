# create-agntcms-app

Scaffold a new agntcms project from the canonical template.

## Usage

```bash
pnpm create agntcms-app my-site
cd my-site
pnpm dev
```

## Local development (monorepo)

When developing the framework itself, use `--local` to link the scaffolded
project back to your monorepo checkout via `file:` protocol:

```bash
# 1. Build all packages
pnpm build

# 2. Scaffold with --local
node packages/cli/dist/index.mjs --local ~/test-site

# 3. Start watch mode in the monorepo (rebuilds packages on change)
pnpm dev

# 4. Start the scaffolded project
cd ~/test-site && pnpm dev
```

Changes in `packages/next/` are rebuilt by the monorepo watcher and picked up
automatically by the scaffolded project through the symlink.

### What `--local` does

- Rewrites `workspace:*` dependencies to `file:` references pointing at the monorepo
- Points `tsconfig.json` extends at the monorepo's `tsconfig.base.json`
- Everything else (template copy, skills init) works identically
