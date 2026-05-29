import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    client: 'src/client.ts',
    handlers: 'src/handlers.ts',
    // Source file is _config.ts to avoid ambiguity with the config/ directory
    // in bundler module resolution. The output is config.mjs / config.d.ts.
    config: 'src/_config.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  external: [
    'react',
    'react-dom',
    'next',
    // The server entry imports `GlobalSaveProvider` ('use client')
    // through the public package boundary so Next.js can preserve the
    // directive. See `react/editable/GlobalSaveProvider.tsx` and
    // `react-server/GlobalSlot.tsx` for the full rationale.
    '@agntcms/next/client',
  ],
  // Next.js 15 transpiles next.config.ts to CJS internally, so
  // require('@agntcms/next/config') must resolve. Explicit extensions
  // avoid Node's ambiguous .js resolution for "type":"module" packages.
  outExtension: ({ format }) => ({
    js: format === 'cjs' ? '.cjs' : '.mjs',
  }),
})
