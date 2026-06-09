/**
 * lib/settings/usage.ts — per-device Settings page visit counts (localStorage)
 *
 * Notes:  Powers the Overview "Frequently used" cards. The counts are a personal, non-sensitive convenience
 *         shortcut, so localStorage (per-device) — no DB write on every settings navigation. Keyed by
 *         catalog href; best-effort (cleared when the user clears site data).
 */
import { SETTINGS_CATALOG, matchSettingsPage, type SettingsPage } from "./catalog"

const KEY = "pleks:settings-usage"
const DISMISS_KEY = "pleks:settings-setup-dismissed"

function read(): Record<string, number> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Record a visit to whichever catalog page this pathname belongs to (no-op for unknown paths). */
export function recordSettingsVisit(pathname: string): void {
  if (typeof window === "undefined") return
  const page = matchSettingsPage(pathname)
  if (!page) return
  try {
    const counts = read()
    counts[page.href] = (counts[page.href] ?? 0) + 1
    window.localStorage.setItem(KEY, JSON.stringify(counts))
  } catch {
    /* storage full / disabled — frequently-used is best-effort */
  }
}

/** The top-N most-visited catalog pages (count > 0), most-visited first. */
export function topSettingsPages(n: number): { page: SettingsPage; count: number }[] {
  const counts = read()
  return SETTINGS_CATALOG
    .map((page) => ({ page, count: counts[page.href] ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

/** Ids of "Set up" Overview cards the user has dismissed on this device. */
export function getDismissedSetup(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** Dismiss a single "Set up" card (by id) for this device. */
export function dismissSetupCard(id: string): void {
  if (typeof window === "undefined") return
  try {
    const cur = getDismissedSetup()
    if (!cur.includes(id)) window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...cur, id]))
  } catch {
    /* best-effort */
  }
}
