// Barrel for the domain module. Named exports only (no default exports, per
// repo code style). This file is the ONE place downstream code inside
// `@agntcms/next` should import domain types from. Domain types are not
// redefined anywhere else in the monorepo.
//
// `domain/` must not import from any sibling module. Invariant 1 of the
// project (see CLAUDE.md) requires the dependency graph to flow
// `domain ← storage ← runtime ← handlers/mcp`, and React/config only
// type-import from runtime.

export type { Page, PageSeo, PageSummary } from './page'
export { assertValidPage, assertValidPageSummary } from './page'
export type { Section } from './section'
export type {
  ButtonValue,
  FieldDescriptor,
  FieldKind,
  ImageValue,
  LinkValue,
  SelectOption,
  VideoValue,
} from './fields'
// Each `TextField`/`ImageField`/… name has BOTH a type meaning (the
// interface) and a value meaning (the singleton or factory). A single
// non-type re-export carries both namespaces — splitting them across
// `export type {}` and `export {}` would produce a duplicate-identifier
// error under `verbatimModuleSyntax`.
export {
  TextField,
  RichTextField,
  ImageField,
  VideoField,
  ReferenceField,
  LinkField,
  ButtonField,
  NumberField,
  BooleanField,
  SelectField,
  ListField,
} from './fields'
export type {
  SectionSchema,
  ReferenceValue,
  FieldValueFor,
  ListItem,
} from './schema'
export { hasUniqueSectionIds } from './invariants'
export {
  validateInternalSlug,
  validateExternalUrl,
  validateEmail,
  validatePhone,
} from './linkValidation'
export { hrefOf, isExternalLink, linkAnchorAttrs, normalizeLinkValue } from './link'
export type { Global } from './global'
