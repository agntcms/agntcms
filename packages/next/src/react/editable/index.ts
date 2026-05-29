// Barrel for the editable/ sub-module of react/.
// Named exports only (repo code style).

export { isPreviewField } from './isPreviewField'
export type { PreviewFieldLike, PreviewFieldOriginLike } from './isPreviewField'
// `read(slot)` collapses an `EditableSlot<K, V>` to its bare `V`.
// Replaces the old `resolveLinkValue` / `resolveField` pattern.
export { read } from './read'
// `isSlotInPreview(slot)` — the public preview-mode signal section authors
// use to keep an OPTIONAL link/image visible & clickable in preview when
// it would otherwise be hidden by an empty-value short-circuit.
export { isSlotInPreview } from './read'
export { EditableText } from './EditableText'
export type { EditableTextProps } from './EditableText'
export { EditableRichText } from './EditableRichText'
export type { EditableRichTextProps } from './EditableRichText'
export { EditableImage } from './EditableImage'
export type { EditableImageProps } from './EditableImage'
export { EditableVideo } from './EditableVideo'
export type { EditableVideoProps } from './EditableVideo'
export { EditableLink } from './EditableLink'
export type { EditableLinkProps } from './EditableLink'
export { EditableButton } from './EditableButton'
export type { EditableButtonProps } from './EditableButton'
export { ButtonPickerModal } from './ButtonPickerModal'
export type { ButtonPickerModalProps } from './ButtonPickerModal'
export { EditableNumber } from './EditableNumber'
export type { EditableNumberProps } from './EditableNumber'
export { EditableBoolean } from './EditableBoolean'
export type { EditableBooleanProps } from './EditableBoolean'
export { EditableSelect } from './EditableSelect'
export type { EditableSelectProps } from './EditableSelect'
export { EditableList } from './EditableList'
export type { EditableListProps } from './EditableList'
// `SlotItem<S>` (in `sections/defineSection.ts`) is the shape of a list
// item that `<EditableList renderItem>` hands to the section author —
// every editable field is an `EditableSlot<K, V>`. The runtime helpers
// `wrapItemForPreview` (preview) and `wrapItemAsSlot` (published) stay
// internal; the public surface is the slot type only, re-exported from
// `react/index.ts` together with `EditableSlot`.
export { ImagePickerModal } from './ImagePickerModal'
export type { ImagePickerModalProps } from './ImagePickerModal'
export { VideoPickerModal } from './VideoPickerModal'
export type { VideoPickerModalProps } from './VideoPickerModal'
export { SaveProvider, useSaveField } from './SaveContext'
export type { SaveFieldFn, SaveProviderProps } from './SaveContext'
export { GlobalSaveProvider } from './GlobalSaveProvider'
export type { GlobalSaveProviderProps } from './GlobalSaveProvider'
