"use server"

/**
 * lib/work/teams.ts — named-team CRUD + membership (ADDENDUM_TEAMS Layer 1, firm-tier)
 *
 * Auth:   listTeams → gateway (read); mutations → requireAgentWriteAccess (+ audited). The firm-tier gate
 *         is enforced at the surface (Teams tab); these actions are org-scoped.
 * Data:   teams + team_members; member names from user_profiles. Archiving a team clears assigned_team_id /
 *         managing_team_id off its items + properties (they fall to Everyone/Org) so nothing dangles (§5).
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { recordAudit } from "@/lib/audit/recordAudit"

export type TeamFunction = "maintenance" | "rentals" | "billing" | "inspections" | "general"
export interface TeamWithMembers {
  id: string
  name: string
  function: TeamFunction
  members: { userId: string; name: string; role: string; phone: string | null; email: string | null }[]
}

export async function listTeams(): Promise<TeamWithMembers[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw

  const { data: teams, error } = await db
    .from("teams").select("id, name, function").eq("org_id", orgId).is("archived_at", null).order("name")
  if (error) { console.error("listTeams:", error.message); return [] }
  const teamRows = (teams ?? []) as { id: string; name: string; function: TeamFunction }[]
  if (teamRows.length === 0) return []

  const { data: members, error: mErr } = await db
    .from("team_members").select("team_id, user_id").eq("org_id", orgId).in("team_id", teamRows.map((t) => t.id))
  if (mErr) { console.error("listTeams members:", mErr.message); return teamRows.map((t) => ({ ...t, members: [] })) }
  const memberRows = (members ?? []) as { team_id: string; user_id: string }[]

  const userIds = [...new Set(memberRows.map((m) => m.user_id))]
  const nameById = new Map<string, string>()
  const phoneById = new Map<string, string | null>()
  const roleById = new Map<string, string>()
  const emailById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await db
      .from("user_profiles").select("id, full_name, first_name, last_name, mobile").in("id", userIds)
    if (pErr) console.error("listTeams profiles:", pErr.message)
    for (const p of (profiles ?? []) as { id: string; full_name: string | null; first_name: string | null; last_name: string | null; mobile: string | null }[]) {
      nameById.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Unnamed")
      phoneById.set(p.id, p.mobile ?? null)
    }
    const { data: orgs, error: oErr } = await db
      .from("user_orgs").select("user_id, role").eq("org_id", orgId).in("user_id", userIds)
    if (oErr) console.error("listTeams roles:", oErr.message)
    for (const o of (orgs ?? []) as { user_id: string; role: string }[]) roleById.set(o.user_id, o.role)

    // Email lives on auth.users — fetched via admin (small N: one org's team members).
    for (const uid of userIds) {
      const { data } = await db.auth.admin.getUserById(uid)
      if (data?.user?.email) emailById.set(uid, data.user.email)
    }
  }

  return teamRows.map((t) => ({
    ...t,
    members: memberRows.filter((m) => m.team_id === t.id).map((m) => ({
      userId: m.user_id,
      name: nameById.get(m.user_id) ?? "Unnamed",
      role: roleById.get(m.user_id) ?? "",
      phone: phoneById.get(m.user_id) ?? null,
      email: emailById.get(m.user_id) ?? null,
    })),
  }))
}

const FUNCTIONS = new Set<TeamFunction>(["maintenance", "rentals", "billing", "inspections", "general"])

export async function createTeam(name: string, fn: TeamFunction): Promise<{ ok: true; id: string } | { error: string }> {
  const clean = name.trim()
  if (!clean) return { error: "Enter a team name" }
  if (!FUNCTIONS.has(fn)) return { error: "Invalid team function" }
  const gw = await requireAgentWriteAccess("create_team")
  const { db, orgId, userId } = gw
  const { data, error } = await db.from("teams").insert({ org_id: orgId, name: clean, function: fn }).select("id").single()
  if (error || !data) return { error: error?.message ?? "Could not create team" }
  const id = (data as { id: string }).id
  await recordAudit(db, { orgId, actorId: userId, action: "INSERT", table: "teams", recordId: id, after: { name: clean, function: fn } })
  return { ok: true, id }
}

export async function updateTeam(teamId: string, patch: { name?: string; function?: TeamFunction }): Promise<{ ok: true } | { error: string }> {
  const update: Record<string, string> = {}
  if (patch.name !== undefined) {
    const clean = patch.name.trim()
    if (!clean) return { error: "Enter a team name" }
    update.name = clean
  }
  if (patch.function !== undefined) {
    if (!FUNCTIONS.has(patch.function)) return { error: "Invalid team function" }
    update.function = patch.function
  }
  if (Object.keys(update).length === 0) return { ok: true }
  const gw = await requireAgentWriteAccess("update_team")
  const { db, orgId, userId } = gw
  const { error } = await db.from("teams").update(update).eq("id", teamId).eq("org_id", orgId)
  if (error) return { error: error.message }
  await recordAudit(db, { orgId, actorId: userId, action: "UPDATE", table: "teams", recordId: teamId, after: update })
  return { ok: true }
}

/**
 * Archive a team. Guarded: the team must be EMPTY first — a team with members can't be archived; the agent
 * must remove/reassign them (so accountability is explicit). Clears the team's assignment off its
 * items/properties (they fall to Everyone/Org) so nothing dangles (§5).
 */
export async function archiveTeam(teamId: string): Promise<{ ok: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("archive_team")
  const { db, orgId, userId } = gw

  const { count, error: cErr } = await db
    .from("team_members").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("team_id", teamId)
  if (cErr) return { error: cErr.message }
  if ((count ?? 0) > 0) return { error: "This team still has members. Remove or reassign them before archiving." }

  for (const table of ["maintenance_requests", "applications", "inspections"] as const) {
    const { error } = await db.from(table).update({ assigned_team_id: null }).eq("org_id", orgId).eq("assigned_team_id", teamId)
    if (error) return { error: `${table}: ${error.message}` }
  }
  const { error: propErr } = await db.from("properties").update({ managing_team_id: null }).eq("org_id", orgId).eq("managing_team_id", teamId)
  if (propErr) return { error: propErr.message }
  const { error: unitErr } = await db.from("units").update({ assigned_team_id: null }).eq("org_id", orgId).eq("assigned_team_id", teamId)
  if (unitErr) return { error: unitErr.message }

  const { error } = await db.from("teams").update({ archived_at: new Date().toISOString() }).eq("id", teamId).eq("org_id", orgId)
  if (error) return { error: error.message }
  await recordAudit(db, { orgId, actorId: userId, action: "UPDATE", table: "teams", recordId: teamId, after: { action: "team_archived" } })
  return { ok: true }
}

export async function addTeamMember(teamId: string, memberUserId: string): Promise<{ ok: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("add_team_member")
  const { db, orgId, userId } = gw
  const { error } = await db.from("team_members").upsert(
    { org_id: orgId, team_id: teamId, user_id: memberUserId },
    { onConflict: "team_id,user_id", ignoreDuplicates: true },
  )
  if (error) return { error: error.message }
  await recordAudit(db, { orgId, actorId: userId, action: "INSERT", table: "team_members", recordId: teamId, after: { team_id: teamId, user_id: memberUserId } })
  return { ok: true }
}

export async function removeTeamMember(teamId: string, memberUserId: string): Promise<{ ok: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("remove_team_member")
  const { db, orgId, userId } = gw
  const { error } = await db.from("team_members").delete().eq("org_id", orgId).eq("team_id", teamId).eq("user_id", memberUserId)
  if (error) return { error: error.message }
  await recordAudit(db, { orgId, actorId: userId, action: "DELETE", table: "team_members", recordId: teamId, before: { team_id: teamId, user_id: memberUserId } })
  return { ok: true }
}

/** Light team list (id + name) for the assignee picker — no members/email fetch. */
export async function listTeamOptions(): Promise<{ id: string; name: string }[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("teams").select("id, name").eq("org_id", orgId).is("archived_at", null).order("name")
  if (error) { console.error("listTeamOptions:", error.message); return [] }
  return data ?? []
}

/** The team ids the current user belongs to — feeds "my work" (team-assigned items) + the team filter. */
export async function getMyTeamIds(): Promise<string[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId, userId } = gw
  const { data, error } = await db
    .from("team_members").select("team_id").eq("org_id", orgId).eq("user_id", userId)
  if (error) { console.error("getMyTeamIds:", error.message); return [] }
  return (data ?? []).map((r) => r.team_id as string)
}
