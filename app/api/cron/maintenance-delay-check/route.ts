import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"

// Creates a delay event if one of that type doesn't already exist for this request
async function maybeInsertDelayEvent(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  maintenanceId: string,
  orgId: string,
  delayType: string,
) {
  const { data: existing } = await service
    .from("maintenance_delay_events")
    .select("id")
    .eq("maintenance_id", maintenanceId)
    .eq("delay_type", delayType)
    .limit(1)
    .maybeSingle()

  if (existing) return

  await service.from("maintenance_delay_events").insert({
    org_id: orgId,
    maintenance_id: maintenanceId,
    delay_type: delayType,
    attributed_to: delayType.startsWith("agent") ? "agent" : "contractor",
    recorded_by: SYSTEM_USER_ID,
  })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const now = new Date()
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  let agentPendingCount = 0
  let contractorNoResponseCount = 0

  // 1. Requests stuck in pending_review for >48h → agent_pending_approval delay event
  const { data: pendingReview, error: err1 } = await service
    .from("maintenance_requests")
    .select("id, org_id")
    .eq("status", "pending_review")
    .lt("created_at", cutoff48h)

  if (err1) {
    console.error("[maintenance-delay-check] pending_review query failed:", err1.message)
  } else {
    for (const req of pendingReview ?? []) {
      await maybeInsertDelayEvent(service, req.id, req.org_id, "agent_pending_approval")
      agentPendingCount++
    }
  }

  // 2. Requests with work_order_sent but no contractor_update after 48h → contractor_no_response
  const { data: unacknowledged, error: err2 } = await service
    .from("maintenance_requests")
    .select("id, org_id")
    .eq("status", "work_order_sent")
    .lt("work_order_sent_at", cutoff48h)

  if (err2) {
    console.error("[maintenance-delay-check] work_order_sent query failed:", err2.message)
  } else {
    for (const req of unacknowledged ?? []) {
      // Only flag if there are truly no contractor updates at all
      const { data: updates } = await service
        .from("contractor_updates")
        .select("id")
        .eq("request_id", req.id)
        .limit(1)
        .maybeSingle()

      if (!updates) {
        await maybeInsertDelayEvent(service, req.id, req.org_id, "contractor_no_response")
        contractorNoResponseCount++
      }
    }
  }

  return Response.json({
    ok: true,
    agent_pending: agentPendingCount,
    contractor_no_response: contractorNoResponseCount,
  })
}
