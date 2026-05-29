// Admin token namespace for the dev-time inline-editing UI.
//
// WHY a separate namespace and not project tokens?
// Pre-existing admin styles read project tokens with hex fallbacks
// (e.g. `var(--color-bg-secondary, #1A1A18)`). The fallback only fires when the
// variable is undefined — but any real project DEFINES that variable with its
// own palette. Result: in a light-themed project the admin modal/toolbar
// inherits near-white surfaces and visually melts into the page. The
// `--agntcms-admin-*` namespace is self-contained and never reads project
// tokens, so admin chrome always renders with the palette declared here.
//
// WHY two themes (light + dark) selected by an attribute — isn't that the
// fragile thing we removed in v0.5.4?
// No. v0.5.4 removed *automatic host-page luminance detection*: it sampled the
// page background and flipped the admin scale to the opposite. That probe was
// fragile (transparent backgrounds, late-painted body styles, dynamic theme
// toggles) and guessed wrong. What we have NOW is different: a *manual,
// persisted* user choice. AdminThemeBoot writes `data-agntcms-admin-theme`
// ("light" | "dark") on <html>, seeded once from the OS `prefers-color-scheme`
// and thereafter from the toolbar toggle + localStorage. There is no probing of
// the host page, so none of the fragility applies — the attribute is set by the
// user and never changes underfoot.
//
// WHY Frosted (translucent + blurred) for BOTH themes?
// Both palettes float a semi-transparent glass panel above the host site:
// separation comes from a backdrop blur + tint + soft drop shadow, not from a
// hard outline. The dark theme tints toward near-black; the light theme tints
// toward near-white. The border is a faint hairline that only crisps the edge.
// This sits coherently on top of arbitrary host-site colors because the
// blur+tint dominate whatever shows through.
//
// WHY a `surface-solid` token + an `@supports` fallback (per theme)?
// `backdrop-filter` is widely but not universally supported. Where it is
// missing, a translucent surface would let host-page content bleed through and
// become unreadable. The `@supports not (...)` blocks below redefine each
// theme's translucent surface tokens to that theme's opaque
// `--agntcms-admin-surface-solid`. Keeping the fallback token-level means
// components never branch on support — they always read
// `var(--agntcms-admin-surface)` and get the right value for the active theme.

export const ADMIN_THEME_CSS = `
:root[data-agntcms-admin-theme="dark"] {
  --agntcms-admin-surface: rgba(24, 24, 27, 0.72);
  --agntcms-admin-surface-raised: rgba(39, 39, 42, 0.80);
  --agntcms-admin-surface-solid: #18181B;
  --agntcms-admin-surface-overlay: rgba(0, 0, 0, 0.50);
  --agntcms-admin-fg: #FAFAFA;
  /*
   * Muted/dim raised for contrast against the translucent dark surface.
   * Checked against the worst-case composite of surface rgba(24,24,27,0.72)
   * over a WHITE host page (~#59595B); the real backdrop is darker once the
   * blur+tint apply (fallback is opaque #18181B). At ~#59595B:
   *   fg #FAFAFA       -> 6.70:1  (AA normal text)
   *   fg-muted #D4D4D8 -> 4.73:1  (AA normal text; body + secondary text)
   *   fg-dim #A1A1AA   -> 2.73:1 worst case / 6.9:1 on #18181B — used only
   *                       for large/tertiary labels (3:1 large-text bar).
   */
  --agntcms-admin-fg-muted: #D4D4D8;
  --agntcms-admin-fg-dim: #A1A1AA;
  --agntcms-admin-border: rgba(255, 255, 255, 0.12);
  --agntcms-admin-border-strong: rgba(255, 255, 255, 0.18);
  --agntcms-admin-accent: #2DD4BF;
  --agntcms-admin-accent-hover: #14B8A6;
  --agntcms-admin-accent-fg: #0A0A0A;
  --agntcms-admin-on-accent: #0A0A0A;
  --agntcms-admin-focus-ring: #2DD4BF;
  --agntcms-admin-danger: #F87171;
  --agntcms-admin-danger-strong: #EF4444;
  --agntcms-admin-warning: #FBBF24;
  --agntcms-admin-success: #34D399;
  --agntcms-admin-backdrop: blur(20px) saturate(160%);
  --agntcms-admin-elevation: 0 8px 32px rgba(0, 0, 0, 0.40);
  /*
   * Status tints — translucent fills for badges, diff highlights, drop-zone
   * active states, and per-section status stripes. Derived from the four
   * status hues above so a status fill always matches its text color. Two
   * strengths: the base (0.15) for subtle fills and -strong (0.24) for
   * heavier emphasis (word-diff highlights, active borders). On the dark
   * frosted surface these read as a soft colored wash rather than a slab.
   */
  --agntcms-admin-accent-tint: rgba(45, 212, 191, 0.15);
  --agntcms-admin-accent-tint-strong: rgba(45, 212, 191, 0.24);
  --agntcms-admin-danger-tint: rgba(248, 113, 113, 0.15);
  --agntcms-admin-danger-tint-strong: rgba(248, 113, 113, 0.24);
  --agntcms-admin-success-tint: rgba(52, 211, 153, 0.15);
  --agntcms-admin-success-tint-strong: rgba(52, 211, 153, 0.24);
  --agntcms-admin-warning-tint: rgba(251, 191, 36, 0.15);
  --agntcms-admin-warning-tint-strong: rgba(251, 191, 36, 0.24);
  /*
   * Editable hover halo — the dashed accent outline alone disappears on busy
   * or low-contrast host backgrounds. This double-ring box-shadow (a dark
   * inner ring + a light outer ring) reads on white, black, AND photo
   * backgrounds because one of the two rings always contrasts. Theme-token so
   * it can be tuned per theme; both themes use the same dual ring since it is
   * background-agnostic by construction.
   */
  --agntcms-admin-editable-halo: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 0 0 4px rgba(255, 255, 255, 0.55);
}

:root[data-agntcms-admin-theme="light"] {
  --agntcms-admin-surface: rgba(255, 255, 255, 0.72);
  --agntcms-admin-surface-raised: rgba(244, 244, 245, 0.85);
  --agntcms-admin-surface-solid: #FFFFFF;
  --agntcms-admin-surface-overlay: rgba(0, 0, 0, 0.35);
  --agntcms-admin-fg: #18181B;
  /*
   * Contrast checked against the worst-case composite of surface
   * rgba(255,255,255,0.72) over a BLACK host page (~#B8B8B8) — pathological
   * (solid-black page behind a light panel); the real blur+saturate backdrop
   * washes lighter and the opaque fallback is pure #FFFFFF (everything passes).
   *                 over ~#B8B8B8 (worst)   on #FFFFFF (fallback)
   *   fg #18181B          8.93:1               17.72:1   (AA normal text)
   *   fg-muted #52525B    3.90:1                7.73:1   (AA-normal on the
   *                       realistic lighter surface; >=3:1 even worst case)
   *   fg-dim #71717A      2.44:1                4.83:1   (large/tertiary
   *                       labels only — 3:1 large-text bar, met on the real
   *                       washed surface).
   */
  --agntcms-admin-fg-muted: #52525B;
  --agntcms-admin-fg-dim: #71717A;
  --agntcms-admin-border: rgba(0, 0, 0, 0.12);
  --agntcms-admin-border-strong: rgba(0, 0, 0, 0.20);
  --agntcms-admin-accent: #0D9488;
  --agntcms-admin-accent-hover: #0F766E;
  --agntcms-admin-accent-fg: #FFFFFF;
  --agntcms-admin-on-accent: #FFFFFF;
  --agntcms-admin-focus-ring: #0D9488;
  --agntcms-admin-danger: #DC2626;
  --agntcms-admin-danger-strong: #B91C1C;
  --agntcms-admin-warning: #D97706;
  --agntcms-admin-success: #059669;
  --agntcms-admin-backdrop: blur(20px) saturate(160%);
  --agntcms-admin-elevation: 0 8px 32px rgba(0, 0, 0, 0.15);
  --agntcms-admin-accent-tint: rgba(13, 148, 136, 0.12);
  --agntcms-admin-accent-tint-strong: rgba(13, 148, 136, 0.20);
  --agntcms-admin-danger-tint: rgba(220, 38, 38, 0.10);
  --agntcms-admin-danger-tint-strong: rgba(220, 38, 38, 0.18);
  --agntcms-admin-success-tint: rgba(5, 150, 105, 0.10);
  --agntcms-admin-success-tint-strong: rgba(5, 150, 105, 0.18);
  --agntcms-admin-warning-tint: rgba(217, 119, 6, 0.10);
  --agntcms-admin-warning-tint-strong: rgba(217, 119, 6, 0.18);
  --agntcms-admin-editable-halo: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 0 0 4px rgba(255, 255, 255, 0.55);
}

/*
 * Fallback for browsers without backdrop-filter support, applied PER THEME.
 * Without the blur, the translucent surfaces would expose host-page content
 * behind them and hurt legibility, so collapse them to each theme's opaque
 * solid surface. The feature test includes the -webkit- prefixed variant so
 * older WebKit/Safari that only ships the prefixed property is correctly
 * treated as "supported".
 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root[data-agntcms-admin-theme="dark"],
  :root[data-agntcms-admin-theme="light"] {
    --agntcms-admin-surface: var(--agntcms-admin-surface-solid);
    --agntcms-admin-surface-raised: var(--agntcms-admin-surface-solid);
  }
}
`

/** Marker attribute used to dedupe the injected `<style>` tag. */
export const ADMIN_THEME_STYLE_MARKER = 'data-agntcms-admin-theme-css'

/** Attribute on `<html>` selecting the active admin theme. */
export const ADMIN_THEME_ATTR = 'data-agntcms-admin-theme'

/** localStorage key persisting the user's manual theme choice. */
export const ADMIN_THEME_STORAGE_KEY = 'agntcms-admin-theme'

/** The two admin themes. Manual + persisted — never auto-probed from the host page. */
export type AdminTheme = 'light' | 'dark'

/** Narrow an arbitrary string to a valid AdminTheme. */
export function isAdminTheme(value: unknown): value is AdminTheme {
  return value === 'light' || value === 'dark'
}
