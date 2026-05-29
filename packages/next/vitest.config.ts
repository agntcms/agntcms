import { defineConfig } from 'vitest/config'
import * as path from 'node:path'

// Minimal vitest config for @agntcms/next. Tests live next to source
// (e.g. foo.ts + foo.test.ts). This will be expanded as the package grows.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // The MCP PoC talks to a real model over a real CLI subprocess, so
    // it needs more headroom than the default 5s.
    testTimeout: 180_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Match the tsconfig `paths` entry so source imports of the
      // public package boundary resolve to the local source during
      // tests. See `react-server/GlobalSlot.tsx` for why the source
      // uses the `@agntcms/next/client` specifier.
      '@agntcms/next/client': path.resolve(__dirname, 'src/client.ts'),
    },
  },
})
