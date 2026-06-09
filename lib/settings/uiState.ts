"use server"

/**
 * lib/settings/uiState.ts — per-(user, org) Settings Overview UI state (cross-device)
 *
 * Auth:   gateway() — the caller's user + org; service client, scoped by user_id + org_id.
 * Data:   settings_ui_state (010 §42). Personal, cross-device UI state: dismissed "Set up" cards +
 *         "Frequently used" page-visit tallies. Not business data, so gateway() (no agent-write lockdown).
 * Notes:  Visit + dismiss are read-modify-write of a single jsonb / text[] column; partial upserts never
 *         clobber the sibling column. Per-user races on one person's own settings nav are negligible.
 */
import { gateway } from "@/lib/supabase/gateway"
import { matchSettingsPage } from "./catalog"

export interface SettingsUiState {
  dismissedSetup: string[]
  pageVisits: Record<string, number>
}

const EMPTY: SettingsUiState = { dismissedSetup: [], pageVisits: {} }

export async function getSettingsUiState(): Promise<SettingsUiState> {
  const gw = await gateway()
  if (!gw) return EMPTY
  const { db, userId, orgId } = gw
  const { data, error } = await db
    .from("settings_ui_state").select("dismissed_setup, page_visits")
    .eq("user_id", userId).eq("org_id", orgId).maybeSingle()
  if (error) { console.error("getSettingsUiState:", error.message); return EMPTY }
  return {
    dismissedSetup: (data?.dismissed_setup as string[] | null) ?? [],
    pageVisits: (data?.page_visits as Record<string, number> | null) ?? {},
  }
}

/** Bump the visit count for whichever catalog page this pathname belongs to (no-op for unknown paths). */
export async function recordSettingsVisit(pathname: string): Promise<void> {
  const page = matchSettingsPage(pathname)
  if (!page) return
  const gw = await gateway()
  if (!gw) return
  const { db, userId, orgId } = gw
  const { data, error } = await db
    .from("settings_ui_state").select("page_visits")
    .eq("user_id", userId).eq("org_id", orgId).maybeSingle()
  if (error) { console.error("recordSettingsVisit read:", error.message); return }
  const visits = (data?.page_visits as Record<string, number> | null) ?? {}
  visits[page.href] = (visits[page.href] ?? 0) + 1
  const { error: upErr } = await db
    .from("settings_ui_state")
    .upsert({ user_id: userId, org_id: orgId, page_visits: visits, updated_at: new Date().toISOString() }, { onConflict: "user_id,org_id" })
  if (upErr) console.error("recordSettingsVisit upsert:", upErr.message)
}

/** Dismiss a single "Set up" Overview card (by id) for this user + org. */
export async function dismissSetupCard(id: string): Promise<void> {
  const gw = await gateway()
  if (!gw) return
  const { db, userId, orgId } = gw
  const { data, error } = await db
    .from("settings_ui_state").select("dismissed_setup")
    .eq("user_id", userId).eq("org_id", orgId).maybeSingle()
  if (error) { console.error("dismissSetupCard read:", error.message); return }
  const cur = (data?.dismissed_setup as string[] | null) ?? []
  if (cur.includes(id)) return
  const { error: upErr } = await db
    .from("settings_ui_state")
    .upsert({ user_id: userId, org_id: orgId, dismissed_setup: [...cur, id], updated_at: new Date().toISOString() }, { onConflict: "user_id,org_id" })
  if (upErr) console.error("dismissSetupCard upsert:", upErr.message)
}
