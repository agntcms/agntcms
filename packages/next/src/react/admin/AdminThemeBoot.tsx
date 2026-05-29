'use client'

// AdminThemeBoot — invisible client component that (1) mounts the admin token
// stylesheet exactly once and (2) selects the active admin theme by writing
// `data-agntcms-admin-theme` on <html>.
//
// The theme is a MANUAL, PERSISTED choice — not host-page auto-detection (see
// the WHY note in admin-theme.ts). On mount it reads the persisted preference
// from localStorage; if absent it seeds once from the OS `prefers-color-scheme`
// media query. The toolbar toggle later overwrites both the attribute and the
// stored value via `setAdminTheme`.
//
// Kept as a discrete unit (rather than inlining in PreviewProvider) so the
// dedupe marker can guard against double-injection when multiple
// PreviewProviders mount in the same tree. Rendered only in preview mode by
// PreviewProvider, so the stylesheet never ships on published pages.

import { useEffect } from 'react'

import {
  ADMIN_THEME_CSS,
  ADMIN_THEME_STYLE_MARKER,
  ADMIN_THEME_ATTR,
  ADMIN_THEME_STORAGE_KEY,
  isAdminTheme,
  type AdminTheme,
} from './admin-theme'

function ensureStyleTag(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${ADMIN_THEME_STYLE_MARKER}]`) !== null) return
  const style = document.createElement('style')
  style.setAttribute(ADMIN_THEME_STYLE_MARKER, '')
  style.textContent = ADMIN_THEME_CSS
  document.head.appendChild(style)
}

/**
 * Resolve the initial theme: persisted choice wins; otherwise seed from the
 * OS color-scheme preference; default to dark if neither is available.
 * SSR-safe — returns 'dark' when `window` is absent.
 */
export function resolveInitialAdminTheme(): AdminTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY)
    if (isAdminTheme(stored)) return stored
  } catch {
    // localStorage may throw (privacy mode, disabled storage). Fall through
    // to the OS preference.
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

/**
 * Apply a theme to <html> and persist it. Exported so the toolbar toggle and
 * the boot component share one implementation. No-op during SSR.
 */
export function setAdminTheme(theme: AdminTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute(ADMIN_THEME_ATTR, theme)
  try {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, theme)
  } catch {
    // Best-effort persistence — a failed write just means the next session
    // re-seeds from the OS preference.
  }
}

export function AdminThemeBoot(): null {
  // All DOM/window access is inside the effect — nothing touches `document`,
  // `window`, or `localStorage` during render or first paint (same SSR
  // discipline as the Modal `mounted` guard).
  useEffect(() => {
    ensureStyleTag()
    // Only seed the attribute if it has not already been set (e.g. by an
    // earlier AdminThemeBoot or a prior toolbar toggle in this session) so we
    // don't clobber a live user choice on a remount.
    const current = document.documentElement.getAttribute(ADMIN_THEME_ATTR)
    if (!isAdminTheme(current)) {
      setAdminTheme(resolveInitialAdminTheme())
    }
  }, [])

  return null
}
