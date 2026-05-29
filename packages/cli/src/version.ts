// Injected by tsup at build time via define. The value is always a
// string literal so consumers can import it without a JSON module.
declare const __CLI_VERSION__: string

// Fallback for test environments where the build-time define is absent.
export const CLI_VERSION: string =
  typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0-dev'
