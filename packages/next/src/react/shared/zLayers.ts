// -----------------------------------------------------------------------
// zLayers — the single z-index ladder for the admin/preview overlay UI.
//
// WHY this exists:
// Field-editor modals (markdown, plain-text, link, list-item, image/video
// pickers) are opened by clicking an editable field. Those fields can live
// in TWO different host contexts:
//
//   1. A page section rendered directly on the page. The only competing
//      overlay is the PreviewToolbar (99999), so an editor at 100000 wins.
//
//   2. Inside the AdminModal "Edit global" sub-modal (GlobalSectionPreview),
//      which renders the section component WITH editable fields inside a
//      Modal at the admin-submodal layer (100001).
//
// Before this ladder, every field editor used a hard-coded 100000. In
// context (2) that is BELOW the 100001 host modal, so clicking a global
// text/richtext field opened the editor *behind* the Edit-global modal —
// the field-editing flow looked broken for globals while working for page
// sections. (Portaling to <body> fixes the containing block, but not the
// paint order between two body-level fixed overlays — that is decided by
// z-index, and 100000 < 100001.)
//
// The fix: field editors sit on their own layer ABOVE the admin-submodal
// layer, so they win regardless of which host opened them. The values are
// spaced so a satellite picker opened from within an editor (e.g. the image
// picker inside the markdown editor) can sit just above its parent editor
// without colliding with the next rung.
//
// Keep ALL overlay z-indexes here. A new overlay must pick a layer from
// this ladder rather than inventing a fresh magic number, so the paint
// order stays auditable in one place.
//
// IMPORT CONSTRAINTS (invariants 1 + 2): plain constants, no imports. Safe
// for any client component.
// -----------------------------------------------------------------------

/** PreviewToolbar — the always-on floating bar in preview mode. */
export const Z_PREVIEW_TOOLBAR = 99999

/** AdminModal — the main tabbed Pages/Globals modal. */
export const Z_ADMIN_MODAL = 100000

/**
 * AdminModal sub-modals layered over the main AdminModal: history,
 * "Edit page", "Edit global" (GlobalSectionPreview host), confirmations.
 */
export const Z_ADMIN_SUBMODAL = 100001

/**
 * Field-editor modals (markdown, plain-text, link, list-item editor) and
 * the asset pickers opened directly from an editable widget. Must sit
 * ABOVE Z_ADMIN_SUBMODAL so editing a field inside the "Edit global"
 * modal is not occluded by that modal.
 */
export const Z_FIELD_EDITOR = 100010

/**
 * Satellite pickers opened from WITHIN a field editor (e.g. the image
 * picker launched from the markdown editor toolbar). One rung above
 * Z_FIELD_EDITOR so it overlays its own parent editor.
 */
export const Z_FIELD_EDITOR_PICKER = 100011
