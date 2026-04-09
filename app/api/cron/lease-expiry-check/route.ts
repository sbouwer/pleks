import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding } from "@/lib/comms/send-email"
import { getOrgDisplayName } from "@/lib/org/displayName"
import { sendLeaseRenewalNotice } from "@/lib/leases/emails"

export async function GET(req: Request) {
  // Verify cron secret
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().split("T")[0]
  let processed = 0

  // 1. CPA auto-renewal notices due
  const { data: needNotice } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, end_date, unit_id, units(unit_number, properties(name))")
    .eq("is_fixed_term", true)
    .eq("cpa_applies", true)
    .is("auto_renewal_notice_sent_at", null)
    .eq("status", "active")
    .lte("auto_renewal_notice_due", today)

  for (const lease of needNotice || []) {
    await supabase.from("leases").update({
      auto_renewal_notice_sent_at: new Date().toISOString(),
    }).eq("id", lease.id)

    await supabase.from("audit_log").insert({
      org_id: lease.org_id,
      table_name: "leases",
      record_id: lease.id,
      action: "UPDATE",
      new_values: { event: "cpa_renewal_notice_sent" },
    })

    // Send CPA s14 renewal notice to tenant
    if (lease.tenant_id && lease.end_date) {
      const [{ data: tenant }, { data: org }] = await Promise.all([
        supabase.from("tenant_view").select("email, first_name, last_name").eq("id", lease.tenant_id).single(),
        supabase.from("organisations").select("name, type, trading_as, first_name, last_name, title, initials, email, phone, brand_logo_url, brand_accent_color").eq("id", lease.org_id).single(),
      ])
      const unit = lease.units as unknown as { unit_number: string; properties: { name: string } } | null
      if (tenant?.email) {
        void sendLeaseRenewalNotice(
          { email: tenant.email, name: [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant" },
          {
            id: lease.id,
            endDate: lease.end_date,
            propertyName: unit?.properties?.name ?? "",
            unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : "Unit",
          },
          { orgId: lease.org_id, orgName: org ? getOrgDisplayName(org) : "Pleks", orgPhone: org?.phone ?? undefined, orgEmail: org?.email ?? undefined, branding: buildBranding(org) }
        )
      }
    }

    processed++
  }

  // 2. Auto-convert expired fixed-term leases to month-to-month
  const { data: expired } = await supabase
    .from("leases")
    .select("id, org_id")
    .eq("is_fixed_term", true)
    .eq("status", "active")
    .lt("end_date", today)

  for (const lease of expired || []) {
    await supabase.from("leases").update({
      status: "month_to_month",
      is_fixed_term: false,
      end_date: null,
    }).eq("id", lease.id)

    await supabase.from("audit_log").insert({
      org_id: lease.org_id,
      table_name: "leases",
      record_id: lease.id,
      action: "UPDATE",
      new_values: { event: "auto_converted_to_month_to_month" },
    })
    processed++
  }

  // 3. Leases in notice period that have passed notice_period_end
  const { data: noticeExpired } = await supabase
    .from("leases")
    .select("id, org_id, unit_id, tenant_id")
    .eq("status", "notice")
    .lt("notice_period_end", today)

  for (const lease of noticeExpired || []) {
    await supabase.from("leases").update({ status: "expired" }).eq("id", lease.id)
    await supabase.from("units").update({ status: "vacant" }).eq("id", lease.unit_id)

    await supabase.from("unit_status_history").insert({
      unit_id: lease.unit_id,
      org_id: lease.org_id,
      from_status: "notice",
      to_status: "vacant",
      reason: "Notice period ended",
    })

    // Update tenancy history
    await supabase.from("tenancy_history").update({
      move_out_date: today,
      status: "ended",
    }).eq("lease_id", lease.id).eq("status", "active")

    processed++
  }

  return NextResponse.json({ ok: true, processed })
}
