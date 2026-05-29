/**
 * A global content block — a named, standalone section instance
 * that lives outside any page. Used for shared elements like
 * headers, footers, CTAs that appear across multiple pages.
 *
 * Unlike pages, globals have no draft/publish cycle in v1 —
 * saves are direct.
 */
export interface Global {
  readonly name: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}
