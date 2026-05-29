// Barrel for the `sections/` module. Named exports only (repo code style).
// This is the ONE place downstream code (runtime, config, react) should pull
// section-registration types from.
//
// `sections/` depends only on `domain/` — invariant 1 of the project. Do not
// add re-exports from any other sibling here.

export { defineSection } from './defineSection'
export type {
  SectionSchema,
  SectionComponent,
  SectionDefinition,
  AnySectionDefinition,
  DefineSectionInput,
  DataOf,
  FieldDataType,
  EditableSlot,
  SlotItem,
} from './defineSection'

// Runtime helper used by `SectionRenderer` (sub-task 2) to lift bare
// values into `EditableSlot<K, V>` before handing props to the section
// component. Co-located with the slot type definition.
export { wrapAsSlot } from './wrapAsSlot'

// `wrapSectionProps` — the single helper every renderer that composes
// `(schema, data)` into a section component's props goes through to
// lift editable fields into slots. Wired into `SectionRenderer`,
// `<GlobalSlot>`, and the section picker preview cards in sub-task 2.
export { wrapSectionProps } from './wrapSectionProps'

export { buildSectionRegistry, DuplicateSectionNameError } from './registry'
export type { SectionRegistry, SectionDefinitionList } from './registry'
