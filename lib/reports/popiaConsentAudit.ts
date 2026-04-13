import { createServiceClient } from "@/lib/supabase/server"
import type { PopiaConsentAuditData, PopiaConsentRow, ReportFilters } from "./types"

export async function buildPopiaConsentAudit(filters: ReportFilters): Promise<PopiaConsentAuditData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("consent_log")
    .select("id, subject_email, consent_type, consent_version, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) console.error("popiaConsentAudit:", error.message)

  const rows: PopiaConsentRow[] = (data ?? []).map((c) => ({
    tenant_name: (c.subject_email as string | null) ?? "—",
    consent_type: c.consent_type as string,
    granted_at: (c.created_at as string)?.slice(0, 10) ?? "",
    version: (c.consent_version as string | null) ?? null,
  }))

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
