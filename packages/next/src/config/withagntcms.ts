// `withagntcms` — wraps the user's `next.config.ts` configuration.
//
// ARCHITECTURE.md §3 shows the canonical call site:
//
//   import { withagntcms } from '@agntcms/next/config'
//   export default withagntcms({ /* ... Next.js config ... */ })
//
// The function exists so the template's wiring is established from
// day one and future framework-level Next.js config has a place to land
// without a breaking change.
//
// Import policy: this file imports NOTHING from the rest of the package.

// Default page extensions that Next.js scans for routes.
//
// In dev we additionally accept `.dev.ts` / `.dev.tsx`, which lets the
// template name dev-only routes (preview toolbar, admin UI, agent MCP
// endpoints) like `route.dev.ts` so they automatically drop out of the
// production build. ARCHITECTURE.md §8 (line 438): "in a production
// deploy, preview mode and the admin UI are hidden by default."
//
// IMPORTANT: order matters. Next.js resolves routes by the first
// extension that matches a given basename. Putting the `dev.*` variants
// first means in dev, `route.dev.ts` wins over `route.ts` for the same
// route — which is what we want so the same folder can ship both.
const DEV_PAGE_EXTENSIONS = ['dev.ts', 'dev.tsx', 'ts', 'tsx', 'js', 'jsx']
const PROD_PAGE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx']

// The glob the framework needs traced for every route. Lives at module
// scope so tests can rely on a single canonical value if needed.
const CONTENT_TRACE_GLOB = './content/**/*'

type TracingIncludes = Record<string, string[]>

/**
 * Wrap a Next.js configuration object for agntcms.
 *
 * Injects a `pageExtensions` default: in dev we accept `.dev.ts` /
 * `.dev.tsx` so dev-only routes (preview, admin, MCP) can be named
 * `route.dev.ts` and excluded from the production build automatically.
 * If the user already provided `pageExtensions`, theirs wins — the
 * convention is opt-in.
 *
 * Exists as the stable wrapping point for future framework-level
 * Next.js config (webpack aliases, image domains, middleware), so the
 * template's call site does not need to change as the framework grows.
 */
export function withagntcms<T extends Record<string, unknown>>(
  nextConfig: T,
): T & { pageExtensions: string[]; outputFileTracingIncludes: TracingIncludes } {
  // We read NODE_ENV at call time (not module load) so the same process
  // can run with different environments across tests without re-importing.
  const isProd = process.env.NODE_ENV === 'production'
  const defaultPageExtensions = isProd ? PROD_PAGE_EXTENSIONS : DEV_PAGE_EXTENSIONS

  // Respect a user-provided `pageExtensions`. The default exists so the
  // template's `.dev.ts` convention works out of the box, but a user who
  // already curates this list (e.g. for MDX) should not be overridden.
  const userPageExtensions = nextConfig.pageExtensions
  const pageExtensions = Array.isArray(userPageExtensions)
    ? (userPageExtensions as string[])
    : [...defaultPageExtensions]

  // why: agntcms reads content/*.json via fs at request time and nothing
  // imports them, so Next won't trace them into the serverless bundle on
  // Vercel; declaring the glob here makes the fix automatic for every
  // template user. Next 15 promoted this out of `experimental`.
  const userTracingIncludes = isPlainRecordOfStringArrays(
    nextConfig.outputFileTracingIncludes,
  )
    ? nextConfig.outputFileTracingIncludes
    : {}
  const outputFileTracingIncludes = mergeTracingIncludes(userTracingIncludes, {
    '/**': [CONTENT_TRACE_GLOB],
  })

  return {
    ...nextConfig,
    pageExtensions,
    outputFileTracingIncludes,
  }
}

// Narrow `unknown` to `Record<string, string[]>` without using `any`. We
// only deep-merge when the user provided the expected shape; anything
// else is treated as if absent (the framework default still applies).
function isPlainRecordOfStringArrays(value: unknown): value is TracingIncludes {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  for (const v of Object.values(value as Record<string, unknown>)) {
    if (!Array.isArray(v)) return false
    if (!v.every((item) => typeof item === 'string')) return false
  }
  return true
}

// Per-route concat-and-dedupe. Order: user entries first, framework
// entries appended — so user globs win positional precedence if Next
// ever uses ordering, while our content glob is still guaranteed present.
function mergeTracingIncludes(
  user: TracingIncludes,
  framework: TracingIncludes,
): TracingIncludes {
  const result: TracingIncludes = {}
  const keys = new Set<string>([...Object.keys(user), ...Object.keys(framework)])
  for (const key of keys) {
    const merged = [...(user[key] ?? []), ...(framework[key] ?? [])]
    result[key] = Array.from(new Set(merged))
  }
  return result
}
