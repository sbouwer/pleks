"use server"

/**
 * lib/work/reassign.ts — bulk reassignment of an agent's work (ADDENDUM_TEAMS Layer 0, §1d)
 *
 * Auth:   getAgentWorkload → gateway (read); bulkReassignAgent → requireAgentWriteAccess.
 * Data:   maintenance_requests/applications/inspections.assigned_user_id + properties.managing_agent_id.
 * Notes:  Moves EVERYTHING an agent is assigned (work items) or manages (properties) to another agent OR
 *         Everyone/Org (null) — so nothing is stranded under an archived/handed-over agent (the two-flow,
 *         both all-tiers per D-13). One summary audit row (no PII). Used by the agent-archival flow.
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { recordAudit } from "@/lib/audit/recordAudit"

const WORK_TABLES = ["maintenance_requests", "applications", "inspections"] as const
type WorkTable = (typeof WORK_TABLES)[number]

/**
 * Restrict a work-item query to OPEN items (spec + modal copy: "open work items"). Terminal items stay with
 * the archived agent — they're historical and don't surface in active queues; reassigning them would
 * distort attribution. Applications: open = not yet approved/declined/withdrawn (incl. early/null stage 2).
 */
function applyOpenFilter<Q extends { not: (c: string, op: string, v: string) => Q; or: (f: string) => Q }>(
  q: Q, table: WorkTable,
): Q {
  if (table === "maintenance_requests") return q.not("status", "in", "(completed,closed,cancelled,rejected,tenant_notified)")
  if (table === "inspections") return q.not("status", "in", "(completed,finalised,dispute_resolved,cancelled)")
  return q.or("stage2_status.is.null,stage2_status.not.in.(approved,declined,withdrawn)")
}

/** How much OPEN work an agent owns — drives whether the archival reassign prompt is needed + the counts. */
export async function getAgentWorkload(userId: string): Promise<{ workItems: number; properties: number }> {
  const gw = await gateway()
  if (!gw) return { workItems: 0, properties: 0 }
  const { db, orgId } = gw

  let workItems = 0
  for (const table of WORK_TABLES) {
    const { count, error } = await applyOpenFilter(
      db.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("assigned_user_id", userId),
      table,
    )
    if (error) { console.error(`getAgentWorkload ${table}:`, error.message); continue }
    workItems += count ?? 0
  }

  const { count: propCount, error: pErr } = await db
    .from("properties").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("managing_agent_id", userId)
  if (pErr) console.error("getAgentWorkload properties:", pErr.message)

  return { workItems, properties: propCount ?? 0 }
}

/** Move all of an agent's assigned work + managed properties to another agent (userId) or Everyone/Org (null). */
export async function bulkReassignAgent(
  fromUserId: string,
  toUserId: string | null,
): Promise<{ ok: true; moved: { workItems: number; properties: number } } | { error: string }> {
  if (fromUserId === toUserId) return { error: "Choose a different agent" }
  const gw = await requireAgentWriteAccess("bulk_reassign_agent")
  const { db, orgId, userId } = gw
  const assignedAt = toUserId ? new Date().toISOString() : null

  let workItems = 0
  for (const table of WORK_TABLES) {
    const { data, error } = await applyOpenFilter(
      db.from(table)
        .update({ assigned_user_id: toUserId, assigned_at: assignedAt })
        .eq("org_id", orgId).eq("assigned_user_id", fromUserId),
      table,
    ).select("id")
    if (error) return { error: `${table}: ${error.message}` }
    workItems += (data ?? []).length
  }

  const { data: props, error: pErr } = await db
    .from("properties")
    .update({ managing_agent_id: toUserId })
    .eq("org_id", orgId).eq("managing_agent_id", fromUserId)
    .select("id")
  if (pErr) return { error: pErr.message }
  const properties = (props ?? []).length

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "user_orgs", recordId: fromUserId,
    after: { action: "agent_work_reassigned", from_user: fromUserId, to_user: toUserId, work_items_moved: workItems, properties_moved: properties },
  })

  return { ok: true, moved: { workItems, properties } }
}

// ── Property handover ─────────────────────────────────────────────────────────
// When a property's manager changes, its open work (maintenance + inspections carry property_id) can move
// to the new manager. Applications are listing/unit-scoped (no property_id) — out of scope here.
const PROPERTY_WORK_TABLES = ["maintenance_requests", "inspections"] as const

/** Count a property's OPEN maintenance + inspections still assigned to the outgoing manager. */
export async function getPropertyHandoverCount(propertyId: string, fromUserId: string): Promise<number> {
  const gw = await gateway()
  if (!gw) return 0
  const { db, orgId } = gw
  let count = 0
  for (const table of PROPERTY_WORK_TABLES) {
    const { count: c, error } = await applyOpenFilter(
      db.from(table).select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("property_id", propertyId).eq("assigned_user_id", fromUserId),
      table,
    )
    if (error) { console.error(`getPropertyHandoverCount ${table}:`, error.message); continue }
    count += c ?? 0
  }
  return count
}

/** Move a property's OPEN work items from the outgoing manager to the new manager (or Everyone/Org). */
export async function movePropertyItems(
  propertyId: string, fromUserId: string, toUserId: string | null,
): Promise<{ ok: true; moved: number } | { error: string }> {
  const gw = await requireAgentWriteAccess("move_property_items")
  const { db, orgId, userId } = gw
  const assignedAt = toUserId ? new Date().toISOString() : null
  let moved = 0
  for (const table of PROPERTY_WORK_TABLES) {
    const { data, error } = await applyOpenFilter(
      db.from(table)
        .update({ assigned_user_id: toUserId, assigned_at: assignedAt })
        .eq("org_id", orgId).eq("property_id", propertyId).eq("assigned_user_id", fromUserId),
      table,
    ).select("id")
    if (error) return { error: `${table}: ${error.message}` }
    moved += (data ?? []).length
  }
  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "properties", recordId: propertyId,
    after: { action: "property_items_reassigned", from_user: fromUserId, to_user: toUserId, items_moved: moved },
  })
  return { ok: true, moved }
}

