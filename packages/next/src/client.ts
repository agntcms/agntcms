'use client'

// Subpath barrel: `@agntcms/next/client`
//
// Re-exports all named exports from `react/`. This barrel goes into the
// browser bundle, so it MUST NOT transitively pull in anything from
// storage/, runtime/, mcp/, tasks/, handlers/, or config/ (invariant 2).
// The `react/` module itself enforces this at its own barrel level.

export {
  PageRenderer,
  SectionRenderer,
  PreviewProvider,
  usePreviewMode,
  PreviewToolbar,
  SectionEditControls,
  SectionPickerModal,
  SectionReplaceOverlay,
  SectionWrapper,
  EditableText,
  EditableRichText,
  EditableImage,
  EditableVideo,
  VideoPickerModal,
  EditableLink,
  EditableButton,
  ButtonPickerModal,
  EditableNumber,
  EditableBoolean,
  EditableSelect,
  EditableList,
  isPreviewField,
  read,
  isSlotInPreview,
  SaveProvider,
  useSaveField,
  GlobalSaveProvider,
  AdminModal,
} from './react/index'

// EDITABILITY_DESIGN.md sub-task 1: section authors put `EditableSlot`
// / `SlotItem` in their `Props` interface. The types are declared in
// `sections/defineSection.ts` (where the schema-to-prop mapping
// `FieldDataType` lives) and surfaced here through `react/`'s barrel
// re-export, because `client.ts` only imports from `./react/` (see the
// "client import safety" test in `exports.test.ts`).
export type { EditableSlot, SlotItem } from './react/index'

export type {
  PageRendererProps,
  SectionRendererProps,
  PreviewContextValue,
  PreviewProviderProps,
  PreviewMode,
  PreviewToolbarProps,
  SectionEditControlsProps,
  DefinitionLike,
  GlobalEntry,
  SectionPickerModalProps,
  SectionReplaceOverlayProps,
  SectionWrapperProps,
  EditableTextProps,
  EditableRichTextProps,
  EditableImageProps,
  EditableVideoProps,
  VideoPickerModalProps,
  EditableLinkProps,
  EditableButtonProps,
  ButtonPickerModalProps,
  EditableNumberProps,
  EditableBooleanProps,
  EditableSelectProps,
  EditableListProps,
  PreviewFieldLike,
  PreviewFieldOriginLike,
  SaveFieldFn,
  SaveProviderProps,
  GlobalSaveProviderProps,
  AdminModalProps,
} from './react/index'
