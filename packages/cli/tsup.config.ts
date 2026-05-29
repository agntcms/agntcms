import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url).pathname, 'utf-8'),
) as { version: string }

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  // CLI binary does not need CJS; it runs as a top-level executable under Node.
  dts: false,
  splitting: false,
  clean: true,
  // Inject the version at build time so `scaffold.ts` does not need to read
  // package.json at runtime (avoids __dirname / JSON import complications in ESM).
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  // commander is a regular `dependency` — it will be present in node_modules
  // after `npm install`. Keeping it external avoids CJS→ESM shimming issues
  // that arise when bundling a CJS package into an .mjs file.
  external: ['commander'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outExtension: () => ({ js: '.mjs' }),
  // Bundle the template into dist/template/ after the TS compilation finishes.
  // The script is ESM-native and has no external dependencies.
  onSuccess: 'node scripts/bundle-template.mjs',
})
