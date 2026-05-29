import { defineWorkspace } from 'vitest/config'

// Vitest scans each listed package for a vitest.config.ts (or inline config)
// and runs their tests. Path filters passed to `vitest run <path>` from the
// repo root resolve across all workspaces, so CLAUDE.md's
// `pnpm test packages/next/src/domain` pattern works out of the box.
export default defineWorkspace(['packages/*'])
