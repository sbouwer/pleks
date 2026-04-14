import { createServiceClient } from "@/lib/supabase/server"
import type { PopiaConsentAuditData, PopiaConsentRow, ReportFilters } from "./types"

type ContactRow = { primary_email: string | null; first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string }

function resolvedName(c: ContactRow | null): string | null {
  if (!c) return null
  if (c.entity_type === "company") return c.company_name ?? null
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null
}

export async function buildPopiaConsentAudit(filters: ReportFilters): Promise<PopiaConsentAuditData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("consent_log")
    .select("id, subject_email, consent_type, consent_version, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) console.error("popiaConsentAudit:", error.message)

  const records = data ?? []

  // Resolve emails → contact names in bulk
  const emails = [...new Set(records.map((r) => r.subject_email as string).filter(Boolean))]
  const nameMap = new Map<string, string>()

  if (emails.length > 0) {
    const { data: contacts, error: cErr } = await db
      .from("contacts")
      .select("primary_email, first_name, last_name, company_name, entity_type")
      .in("primary_email", emails)
    if (cErr) console.error("popiaConsentAudit contacts:", cErr.message)
    for (const c of (contacts ?? []) as unknown as ContactRow[]) {
      if (!c.primary_email) continue
      const name = resolvedName(c)
      if (name) nameMap.set(c.primary_email, name)
    }
  }

  const rows: PopiaConsentRow[] = records.map((c) => {
    const email = (c.subject_email as string | null) ?? "—"
    const resolved = nameMap.get(email) ?? email
    return {
      tenant_name: resolved,
      consent_type: c.consent_type as string,
      granted_at: (c.created_at as string)?.slice(0, 10) ?? "",
      version: (c.consent_version as string | null) ?? null,
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
