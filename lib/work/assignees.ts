"use server"

/**
 * lib/work/assignees.ts — assignment mutations + agent list (ADDENDUM_TEAMS Layer 0)
 *
 * Auth:   listOrgAgents → gateway (read); reassign* → requireAgentWriteAccess (mutation + lockdown gate).
 * Data:   user_orgs/user_profiles (agent list); maintenance_requests/applications/inspections.assigned_user_id;
 *         properties.managing_agent_id. NULL assignee = Everyone/Org (D-11/12). Every change is audited.
 * Notes:  The assignee picker calls these. Work-item table is an allowlisted union; property manager is the
 *         separate managing_agent_id path. Reassignment is a T2 operational change (recordAudit).
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { recordAudit } from "@/lib/audit/recordAudit"

export interface OrgAgent { userId: string; name: string }

/** Active org members, for the "assign to an agent" picker. */
export async function listOrgAgents(): Promise<OrgAgent[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("user_orgs")
    .select("user_id, user_profiles(full_name, first_name, last_name)")
    .eq("org_id", orgId)
    .is("deleted_at", null)
  if (error) { console.error("listOrgAgents:", error.message); return [] }
  type Row = { user_id: string; user_profiles: { full_name: string | null; first_name: string | null; last_name: string | null } | null }
  return ((data ?? []) as unknown as Row[]).map((m) => ({
    userId: m.user_id,
    name: [m.user_profiles?.first_name, m.user_profiles?.last_name].filter(Boolean).join(" ")
      || m.user_profiles?.full_name || "Unnamed",
  }))
}

const WORK_TABLES = new Set(["maintenance_requests", "applications", "inspections"])
export type WorkTable = "maintenance_requests" | "applications" | "inspections"

/** Reassign a work item to an agent (userId), a team (teamId), or Everyone/Org (both null). Audited.
 *  assigned_user_id XOR assigned_team_id — the caller passes at most one non-null (not-both CHECK). */
export async function reassignWorkItem(
  table: WorkTable,
  recordId: string,
  assignedUserId: string | null,
  assignedTeamId: string | null = null,
): Promise<{ ok: true } | { error: string }> {
  if (!WORK_TABLES.has(table)) return { error: "Invalid work type" }
  const gw = await requireAgentWriteAccess("reassign_work_item")
  const { db, orgId, userId } = gw

  const { data: before, error: readErr } = await db
    .from(table).select("assigned_user_id, assigned_team_id").eq("id", recordId).eq("org_id", orgId).single()
  if (readErr) return { error: readErr.message }

  const { error } = await db
    .from(table)
    .update({
      assigned_user_id: assignedUserId,
      assigned_team_id: assignedTeamId,
      assigned_at: (assignedUserId || assignedTeamId) ? new Date().toISOString() : null,
    })
    .eq("id", recordId).eq("org_id", orgId)
  if (error) return { error: error.message }

  const prev = before as { assigned_user_id: string | null; assigned_team_id: string | null } | null
  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table, recordId,
    before: { assigned_user_id: prev?.assigned_user_id ?? null, assigned_team_id: prev?.assigned_team_id ?? null },
    after: { assigned_user_id: assignedUserId, assigned_team_id: assignedTeamId },
  })
  return { ok: true }
}

/** Set the property manager to an agent (userId), a team (teamId), or Everyone/Org (both null). Audited.
 *  managing_agent_id XOR managing_team_id (not-both CHECK) — caller passes at most one non-null. */
export async function setPropertyManager(
  propertyId: string,
  agentUserId: string | null,
  teamId: string | null = null,
): Promise<{ ok: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("set_property_manager")
  const { db, orgId, userId } = gw

  const { data: before, error: readErr } = await db
    .from("properties").select("managing_agent_id, managing_team_id").eq("id", propertyId).eq("org_id", orgId).single()
  if (readErr) return { error: readErr.message }

  const { error } = await db
    .from("properties").update({ managing_agent_id: agentUserId, managing_team_id: teamId }).eq("id", propertyId).eq("org_id", orgId)
  if (error) return { error: error.message }

  const prev = before as { managing_agent_id: string | null; managing_team_id: string | null } | null
  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "properties", recordId: propertyId,
    before: { managing_agent_id: prev?.managing_agent_id ?? null, managing_team_id: prev?.managing_team_id ?? null },
    after: { managing_agent_id: agentUserId, managing_team_id: teamId },
  })
  return { ok: true }
}
