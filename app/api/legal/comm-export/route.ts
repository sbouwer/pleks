/**
 * app/api/legal/comm-export/route.ts — Tribunal-ready communication audit PDF
 *
 * Route:  GET /api/legal/comm-export?lease_id={id}
 * Auth:   gateway (agent session) — lease must belong to agent's org
 * Data:   communication_log, communication_delivery_events via service client
 * Notes:  Produces a date-ordered PDF of every comm sent on the lease with full
 *         body text, delivery-event chain, and portal-view events.
 *         Doubles as POPIA s23 export artifact. BUILD_63 Phase 8 (§8.4).
 */

import * as React from "react"
import { type NextRequest, NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import {
  CommExportPdf,
  type CommExportComm,
  type CommExportDeliveryEvent,
} from "@/lib/comms/CommExportPdf"
import { logQueryError } from "@/lib/supabase/logQueryError"

export const dynamic = "force-dynamic"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

async function fetchLease(service: ServiceClient, leaseId: string, orgId: string) {
  const { data, error } = await service
    .from("leases")
    .select("id, tenant_id, unit_id, start_date, end_date, status, tenant_view(first_name, last_name), units(unit_number, properties(address_line1, suburb, city))")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  if (error) return null
  return data
}

async function fetchComms(service: ServiceClient, leaseId: string, orgId: string): Promise<CommExportComm[]> {
  const { data, error } = await service
    .from("communication_log")
    .select("id, subject, template_key, channel, direction, status, created_at, body_full, tone_variant, attempt_number, trigger_event_type")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) {
    console.error("[comm-export] comms fetch failed:", error.message)
    return []
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id as string)
  const { data: evts, error: evtsError } = await service
    .from("communication_delivery_events")
    .select("communication_log_id, event_type, provider, occurred_at")
    .in("communication_log_id", ids)
    .order("occurred_at", { ascending: true })
    logQueryError("fetchComms communication_delivery_events", evtsError)

  const evtsByComm = new Map<string, CommExportDeliveryEvent[]>()
  for (const e of evts ?? []) {
    const key = e.communication_log_id as string
    const list = evtsByComm.get(key) ?? []
    list.push({ event_type: e.event_type as string, provider: e.provider as string, occurred_at: e.occurred_at as string })
    evtsByComm.set(key, list)
  }

  return rows.map((r) => ({
    id:                 r.id as string,
    subject:            r.subject as string | null,
    template_key:       r.template_key as string | null,
    channel:            r.channel as string,
    direction:          r.direction as string,
    status:             r.status as string | null,
    created_at:         r.created_at as string,
    body_full:          r.body_full as string | null,
    tone_variant:       r.tone_variant as string | null,
    attempt_number:     (r.attempt_number as number | null) ?? 1,
    trigger_event_type: r.trigger_event_type as string | null,
    delivery_events:    evtsByComm.get(r.id as string) ?? [],
  }))
}

function buildPropertyLabel(lease: ReturnType<typeof fetchLease> extends Promise<infer T> ? T : never): string {
  if (!lease) return "Unknown property"
  type PropRow = { address_line1: string | null; suburb: string | null; city: string | null }
  type UnitRow = { unit_number: string | null; properties: PropRow | PropRow[] | null }
  const unit = lease.units as unknown as UnitRow | null
  const rawProp = unit?.properties ?? null
  const prop = Array.isArray(rawProp) ? rawProp[0] : rawProp
  return [
    prop?.address_line1,
    unit?.unit_number ? `Unit ${unit.unit_number}` : null,
    prop?.suburb ?? prop?.city,
  ].filter(Boolean).join(", ") || "Property"
}

export async function GET(req: NextRequest) {
  const gw = await gatewaySSR()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { orgId } = gw

  const leaseId = req.nextUrl.searchParams.get("lease_id")
  if (!leaseId) return NextResponse.json({ error: "lease_id required" }, { status: 400 })

  const service = await createServiceClient()

  const lease = await fetchLease(service, leaseId, orgId)
  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

  const [comms, { data: org }] = await Promise.all([
    fetchComms(service, leaseId, orgId),
    service.from("organisations").select("name").eq("id", orgId).single(),
  ])

  type TenantView = { first_name: string | null; last_name: string | null }
  const tv = lease.tenant_view as unknown as TenantView | null
  const tenantName = [tv?.first_name, tv?.last_name].filter(Boolean).join(" ") || "Tenant"
  const propertyLabel = buildPropertyLabel(lease)

  const pdfElement = React.createElement(CommExportPdf, {
    orgName:       (org?.name as string | null) ?? "Property Manager",
    tenantName,
    propertyLabel,
    leaseFrom:     lease.start_date as string | null,
    leaseTo:       lease.end_date as string | null,
    exportedAt:    new Date().toISOString(),
    comms,
  })

  const buffer = await renderToBuffer(pdfElement as unknown as Parameters<typeof renderToBuffer>[0])
  const filename = `comm-audit-${leaseId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.pdf`

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  })
}
