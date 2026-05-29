// Root barrel: `@agntcms/next`
//
// ARCHITECTURE.md section 9 describes this as the root subpath containing
// "general types and factories needed everywhere": defineSection, field
// type constructors (TextField, RichTextField, ImageField, ReferenceField),
// and domain types (SectionDefinition, Page, Section). "Only types and pure
// functions, no runtime code."
//
// Handlers are NOT re-exported here — they are a specialised import from
// `@agntcms/next/handlers`.

// -- domain types --
export type { Global } from './domain/index'
export type { Page, PageSeo, PageSummary } from './domain/index'
export type { Section } from './domain/index'
export type {
  ButtonValue,
  FieldDescriptor,
  FieldKind,
  ImageValue,
  LinkValue,
  SelectOption,
  VideoValue,
} from './domain/index'
// Each `TextField`/`ImageField`/… name has BOTH a type meaning (the
// interface) and a value meaning (the singleton or factory). A single
// non-type re-export carries both namespaces.
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
} from './domain/index'
export type {
  SectionSchema,
  ReferenceValue,
  FieldValueFor,
  ListItem,
} from './domain/index'
export { hasUniqueSectionIds } from './domain/index'
export {
  hrefOf,
  isExternalLink,
  linkAnchorAttrs,
  normalizeLinkValue,
  validateInternalSlug,
  validateExternalUrl,
  validateEmail,
  validatePhone,
} from './domain/index'

// -- section definition --
export { defineSection } from './sections/index'
export type {
  SectionComponent,
  SectionDefinition,
  AnySectionDefinition,
  DefineSectionInput,
  DataOf,
  FieldDataType,
  // EDITABILITY_DESIGN.md sub-task 1: type-only re-exports of the slot
  // brand and list-item shape. Authors typing a section component's
  // `Props` use these. The runtime constructor `wrapAsSlot` is NOT
  // exposed at the root barrel — it is a server-side helper consumed
  // by SectionRenderer in sub-task 2.
  EditableSlot,
  SlotItem,
} from './sections/index'

