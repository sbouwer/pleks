import { createServiceClient } from "@/lib/supabase/server"
import type { PopiaConsentAuditData, PopiaConsentRow, ReportFilters } from "./types"

export async function buildPopiaConsentAudit(filters: ReportFilters): Promise<PopiaConsentAuditData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("consent_log")
    .select("id, tenant_id, consent_type, granted_at, version, tenants(contacts(first_name, last_name, company_name, entity_type))")
    .eq("org_id", orgId)
    .order("granted_at", { ascending: false })

  if (error) console.error("popiaConsentAudit:", error.message)

  const rows: PopiaConsentRow[] = (data ?? []).map((c) => {
    const tRaw = c.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
    const tc = tRaw?.contacts
    const tenantName = tc?.entity_type === "company"
      ? (tc.company_name ?? "Tenant")
      : `${tc?.first_name ?? ""} ${tc?.last_name ?? ""}`.trim() || "Tenant"
    return {
      tenant_name: tenantName,
      consent_type: c.consent_type as string,
      granted_at: (c.granted_at as string)?.slice(0, 10) ?? "",
      version: (c.version as string | null) ?? null,
    }
  })

  const typeMap = new Map<string, number>()
  for (const r of rows) {
    typeMap.set(r.consent_type, (typeMap.get(r.consent_type) ?? 0) + 1)
  }

  return {
    as_at: new Date(),
    rows,
    total_records: rows.length,
    by_type: Array.from(typeMap.entries()).map(([consent_type, count]) => ({ consent_type, count })),
  }
}
