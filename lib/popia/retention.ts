/**
 * lib/popia/retention.ts — POPIA retention choke point (D-POPIA-06)
 *
 * Auth:   Service-role only — never import in client components
 * Data:   retention_policies_snapshot
 * Notes:  isErasableNow() is the single gate for ALL purge operations.
 *         The custom `pleks/no-popia-raw-delete` ESLint rule blocks raw DELETEs that bypass this
 *         on `landlords`/`tenants` only (today's coverage); broader table coverage is pending (D-8).
 *         D-POPIA-02 defaults are baked in; retention_policies_snapshot overrides them.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Category enum ────────────────────────────────────────────────────────────
// Every table-group purged by the cron or erasure cascade is mapped to a category.
// Categories match the D-POPIA-02 retention table and PROCESSING_PURPOSES.md.

export type DataCategory =
  | "trust_account_records"   // 5yr from transaction date (PPRA)
  | "lease_documents"         // 5yr post-termination (Prescription Act + PPRA)
  | "inspection_photos"       // 3yr post-termination (RHA) — must also wait for active lease to end
  | "inspection_reports"      // same window as photos (share RHA retention)
  | "rent_ledger"             // 5yr from transaction date (Tax Administration Act + PPRA)
  | "communications"          // 5yr post-termination
  | "rejected_applications"   // 12mo from rejection (POPIA minimisation)
  | "credit_checks"           // 12mo from pull OR lease termination — whichever is later
  | "consent_log"             // never (POPIA s17 accountability — immutable forever)
  | "audit_log"               // 7yr (SA business records standard)
  | "maintenance_records"     // 3yr post-completion
  | "platform_account"        // 30 days post account closure

export type RetentionDecision =
  | { erasable: true }
  | { erasable: false; retained_until: Date; reason: string; legal_basis: string }
  | { anonymisable: true; retain_shell: true; reason: string }

export type RetentionPolicy = {
  retention_months: number
  legal_basis: string
  regulatory_source: string
  erasable_during_retention: boolean
  never_erasable?: boolean
}

export type RetentionPoliciesSnapshot = {
  org_id: string
  effective_from: string
  policies: Record<DataCategory, RetentionPolicy>
}

// ─── Platform defaults (D-POPIA-02) ──────────────────────────────────────────

const PLATFORM_DEFAULTS: Record<DataCategory, RetentionPolicy> = {
  trust_account_records: {
    retention_months: 60,
    legal_basis: "legal_obligation",
    regulatory_source: "PPRA s54A",
    erasable_during_retention: false,
  },
  lease_documents: {
    retention_months: 60,
    legal_basis: "legal_obligation",
    regulatory_source: "Prescription Act 68 of 1969 + PPRA practice",
    erasable_during_retention: false,
  },
  inspection_photos: {
    retention_months: 36,
    legal_basis: "legal_obligation",
    regulatory_source: "Rental Housing Act 50 of 1999 s5(3)",
    erasable_during_retention: false,
  },
  inspection_reports: {
    retention_months: 36,
    legal_basis: "legal_obligation",
    regulatory_source: "Rental Housing Act 50 of 1999 s5(3)",
    erasable_during_retention: false,
  },
  rent_ledger: {
    retention_months: 60,
    legal_basis: "legal_obligation",
    regulatory_source: "Tax Administration Act 28 of 2011 s29 + PPRA",
    erasable_during_retention: false,
  },
  communications: {
    retention_months: 60,
    legal_basis: "legitimate_interest",
    regulatory_source: "PPRA practice — aligned with trust-record retention",
    erasable_during_retention: false,
  },
  rejected_applications: {
    retention_months: 12,
    legal_basis: "legitimate_interest",
    regulatory_source: "POPIA s14 minimisation principle",
    erasable_during_retention: false,
  },
  credit_checks: {
    retention_months: 12,
    legal_basis: "consent",
    regulatory_source: "POPIA s11(1)(a) + credit bureau consent form",
    erasable_during_retention: false,
  },
  consent_log: {
    retention_months: 99999,
    legal_basis: "legal_obligation",
    regulatory_source: "POPIA s17 (accountability principle)",
    erasable_during_retention: false,
    never_erasable: true,
  },
  audit_log: {
    retention_months: 84,
    legal_basis: "legal_obligation",
    regulatory_source: "SA business records retention standard",
    erasable_during_retention: false,
  },
  maintenance_records: {
    retention_months: 36,
    legal_basis: "legitimate_interest",
    regulatory_source: "RHT evidentiary practice",
    erasable_during_retention: false,
  },
  platform_account: {
    retention_months: 0,
    legal_basis: "consent",
    regulatory_source: "POPIA s14 minimisation — account data deleted 30 days post closure",
    erasable_during_retention: true,
  },
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * The single gate for all purge operations (D-POPIA-06).
 * Every delete that flows through lib/popia/erasure.ts calls this first.
 */
export async function isErasableNow(
  category: DataCategory,
  context: {
    orgId: string
    lease_active?: boolean
    termination_date?: Date
    created_at: Date
    closed_at?: Date
  },
): Promise<RetentionDecision> {
  const policy = await resolvePolicy(context.orgId, category)

  if (policy.never_erasable) {
    return {
      erasable: false,
      retained_until: new Date(9999, 11, 31),
      reason: `${category} is immutable by POPIA accountability principle`,
      legal_basis: policy.regulatory_source,
    }
  }

  // Inspection photos/reports: must also wait for active lease to end
  if (
    (category === "inspection_photos" || category === "inspection_reports") &&
    context.lease_active
  ) {
    return {
      erasable: false,
      retained_until: context.termination_date ?? new Date(9999, 11, 31),
      reason: "Inspection records retained while lease is active (RHA s5(3))",
      legal_basis: policy.regulatory_source,
    }
  }

  // For termination-anchored categories, compute eligible date from termination
  const anchor = resolveAnchorDate(category, context)
  if (!anchor) {
    // No anchor means we can't determine retention — treat as not erasable
    return {
      erasable: false,
      retained_until: new Date(9999, 11, 31),
      reason: "Retention anchor date not determinable",
      legal_basis: policy.regulatory_source,
    }
  }

  const eligibleAt = addMonths(anchor, policy.retention_months)

  if (new Date() >= eligibleAt) {
    return { erasable: true }
  }

  // Rent ledger and trust account records are anonymisable during retention
  if (category === "rent_ledger" || category === "trust_account_records") {
    return {
      anonymisable: true,
      retain_shell: true,
      reason: `${category} retained ${policy.retention_months} months per ${policy.regulatory_source} — identifying fields can be stripped`,
    }
  }

  return {
    erasable: false,
    retained_until: eligibleAt,
    reason: `${category} retained ${policy.retention_months} months per ${policy.regulatory_source}`,
    legal_basis: policy.legal_basis,
  }
}

export async function getRetentionPolicies(orgId: string): Promise<RetentionPoliciesSnapshot> {
  const db = createServiceClient()
  const { data, error: queryError } = await (await db)
    .from("retention_policies_snapshot")
    .select("org_id, effective_from, policies")
    .eq("org_id", orgId)
    .is("superseded_at", null)
    .single()
    logQueryError("getRetentionPolicies retention_policies_snapshot", queryError)

  if (data?.policies) {
    return data as RetentionPoliciesSnapshot
  }

  return {
    org_id: orgId,
    effective_from: new Date().toISOString().slice(0, 10),
    policies: PLATFORM_DEFAULTS,
  }
}

/**
 * Subject-facing retention summary — bypasses user_orgs check via service role.
 * Used by the subject's retention dashboard to show per-category retention status.
 */
export async function getRetentionForSubject(
  subjectUserId: string,
  orgId: string,
): Promise<{ category: DataCategory; decision: RetentionDecision }[]> {
  // Fetch the subject's active lease to determine context
  const db = createServiceClient()
  const { data: leases, error: leasesError } = await (await db)
    .from("leases")
    .select("status, end_date")
    .eq("org_id", orgId)
    .in(
      "id",
      (await (await db)
        .from("lease_parties")
        .select("lease_id")
        .eq("org_id", orgId)
        .eq("user_id", subjectUserId)).data?.map((r: { lease_id: string }) => r.lease_id) ?? [],
    )
    .order("start_date", { ascending: false })
    .limit(1)
    logQueryError("getRetentionForSubject leases", leasesError)

  const latestLease = leases?.[0]
  const lease_active = latestLease?.status === "active"
  const termination_date = latestLease?.end_date ? new Date(latestLease.end_date) : undefined

  const categories: DataCategory[] = [
    "lease_documents",
    "inspection_photos",
    "inspection_reports",
    "rent_ledger",
    "communications",
    "credit_checks",
    "maintenance_records",
    "rejected_applications",
    "consent_log",
    "audit_log",
  ]

  const results = await Promise.all(
    categories.map(async (category) => ({
      category,
      decision: await isErasableNow(category, {
        orgId,
        lease_active,
        termination_date,
        created_at: new Date(),
      }),
    })),
  )

  return results
}

export async function getErasureEligibleDate(
  category: DataCategory,
  context: {
    orgId: string
    lease_active: boolean
    termination_date?: Date
    created_at: Date
  },
): Promise<Date | null> {
  const policy = await resolvePolicy(context.orgId, category)
  if (policy.never_erasable) return null

  const anchor = resolveAnchorDate(category, context)
  if (!anchor) return null

  return addMonths(anchor, policy.retention_months)
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function resolvePolicy(orgId: string, category: DataCategory): Promise<RetentionPolicy> {
  const snapshot = await getRetentionPolicies(orgId)
  return snapshot.policies[category] ?? PLATFORM_DEFAULTS[category]
}

function resolveAnchorDate(
  category: DataCategory,
  context: {
    lease_active?: boolean
    termination_date?: Date
    created_at: Date
    closed_at?: Date
  },
): Date | null {
  switch (category) {
    case "lease_documents":
    case "inspection_photos":
    case "inspection_reports":
    case "communications":
    case "credit_checks":
      // Anchored to termination date; fall back to created_at if unknown
      return context.termination_date ?? context.created_at

    case "trust_account_records":
    case "rent_ledger":
    case "audit_log":
    case "maintenance_records":
    case "rejected_applications":
      // Anchored to when the record was created/transacted
      return context.created_at

    case "platform_account":
      // Anchored to account closure; falls back to created_at
      return context.closed_at ?? context.created_at

    case "consent_log":
      return null  // never erasable — handled before this is called
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
