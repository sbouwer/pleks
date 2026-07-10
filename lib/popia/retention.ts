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
import { resolveSubject, subjectLeaseIds } from "./anonymiseIdentity"
import { saTodayISO } from "@/lib/dates"

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
  | "fica_identity"           // 5yr post-relationship (FIC Act s23/s24) — the natural-person ID/verification clock
  | "property_documents"      // 5yr from upload (PPRA/RHA doc retention) — soft-deleted docs purged by the cron
  | "declined_decision_record" // 5yr from terminal decision (F3 Q1(b-lite) — structurally-typed accountability record)
  | "consent_proof"           // 5yr from consent_verifications.created_at (F3 Q2(a) — proof of lawful consent)

export type RetentionDecision =
  | { erasable: true }
  | { erasable: false; retained_until: Date; reason: string; legal_basis: string }
  | { anonymisable: true; retain_shell: true; reason: string }

export type RetentionPolicy = {
  retention_months: number
  /** Day-exact override. When set, this WINS over retention_months for the eligible-date math.
   *  The month model (addMonths) drifts 89–92d; rejected_applications is a day-exact 90-day public
   *  commitment (PAIA Manual + credit-check-policy), so it carries retention_days: 90. */
  retention_days?: number
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
    // SINGLE 90-day declined-applicant tier (ADDENDUM_70H F3). Day-exact, not the month model — the
    // public PAIA Manual + credit-check-policy commit to "90 days after rejection... including identity
    // documents, bank statements, and income records", and the live purge enforces it day-exact. All
    // declined PII (identity + screening artefacts) purges here; there is no separate 12-month tier.
    retention_months: 3,
    retention_days: 90,
    legal_basis: "legitimate_interest",
    regulatory_source: "POPIA s14 minimisation principle + PAIA Manual 90-day public commitment",
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
  fica_identity: {
    // The natural person's identity/verification record (ID, FICA docs) has its OWN statutory clock,
    // distinct from lease_documents — so "why do you still hold my ID" cites the actual statute (D-2).
    retention_months: 60,
    legal_basis: "legal_obligation",
    regulatory_source: "FIC Act 38 of 2001 s23/s24 (5yr post business relationship)",
    erasable_during_retention: false,
  },
  property_documents: {
    // Title deeds / CoCs / inspection reports etc. A soft-deleted property doc (D-8 F-2) is purged by
    // the retention cron only once 5yr have passed since upload — conservative single window over the
    // 3–5yr range; per-type windows can be refined later.
    retention_months: 60,
    legal_basis: "legal_obligation",
    regulatory_source: "PPRA / Rental Housing Act property-document retention practice",
    erasable_during_retention: false,
  },
  declined_decision_record: {
    // F3 Q1(b-lite) Tier 2: the structurally-typed decision-accountability record (FitScore composite +
    // band + version stamps + decision-reason/adverse-factor codes + decided_*/capacity + audit anchor)
    // survives the 90-day raw purge (rejected_applications) and strips at 5yr via complianceRecordsSweep.
    // Active legal hold suspends. Counsel-signed (F3 disposition pass 6, item 31 proportionality).
    retention_months: 60,
    legal_basis: "legitimate_interest",
    regulatory_source: "POPIA s14(1)(b) — accountability + establishment/exercise/defence of legal rights (PEPUDA / RHA / NCA)",
    erasable_during_retention: false,
  },
  consent_proof: {
    // F3 Q2(a): consent_verifications.target_email / target_phone_e164 retained as proof of lawful consent,
    // stripped at 5yr (the consent event row itself persists). Hold-gated via the application chain.
    retention_months: 60,
    legal_basis: "legitimate_interest",
    regulatory_source: "POPIA s14(1)(b) — proof of lawful consent to conduct credit and screening checks",
    erasable_during_retention: false,
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

  const eligibleAt = eligibleDate(anchor, policy)

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
    reason: `${category} retained ${retentionWindowLabel(policy)} per ${policy.regulatory_source}`,
    legal_basis: policy.legal_basis,
  }
}

/** Human window label for a policy — prefers the day-exact figure when set, else the month figure. */
function retentionWindowLabel(policy: RetentionPolicy): string {
  if (typeof policy.retention_days === "number") return `${policy.retention_days} days`
  return `${policy.retention_months} months`
}

/**
 * Public display helper — the ONE source emails/UI derive a category's retention window from.
 * Prefers the day-exact figure. Returns e.g. "90 days" for rejected_applications, "12 months" for
 * credit_checks. PLATFORM_DEFAULTS stays un-exported (this is the sanctioned read surface).
 */
export function retentionDisplay(category: DataCategory): string {
  return retentionWindowLabel(PLATFORM_DEFAULTS[category])
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
    effective_from: saTodayISO(),
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
  // Fetch the subject's latest lease for context. No `lease_parties` table — resolve tenant→leases (PR-1).
  const db = await createServiceClient()
  const resolved = await resolveSubject(db, { org_id: orgId, user_id: subjectUserId })
  const leaseIds = await subjectLeaseIds(db, orgId, resolved.tenantId)
  const { data: leases, error: leasesError } = await db
    .from("leases")
    .select("status, end_date")
    .eq("org_id", orgId)
    .in("id", leaseIds)
    .order("start_date", { ascending: false })
    .limit(1)
    logQueryError("getRetentionForSubject leases", leasesError)

  const latestLease = leases?.[0]
  const lease_active = latestLease?.status === "active"
  const termination_date = latestLease?.end_date ? new Date(latestLease.end_date) : undefined

  // D-4: compose over the FULL referencing set — the contact shell is purgeable only when retention
  // is satisfied across EVERY category the subject has data in. The prior list omitted
  // trust_account_records (the landlord gate), fica_identity, and platform_account, so it could not
  // answer "is this whole person purgeable?" for a landlord with trust records.
  const categories: DataCategory[] = [
    "lease_documents",
    "inspection_photos",
    "inspection_reports",
    "rent_ledger",
    "trust_account_records",
    "communications",
    "credit_checks",
    "maintenance_records",
    "rejected_applications",
    "fica_identity",
    "platform_account",
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

  return eligibleDate(anchor, policy)
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
    case "fica_identity":
      // Anchored to relationship-end (latest lease termination); fall back to created_at if unknown
      return context.termination_date ?? context.created_at

    case "trust_account_records":
    case "rent_ledger":
    case "audit_log":
    case "maintenance_records":
    case "rejected_applications":
    case "property_documents":
    case "declined_decision_record":  // anchored to decided_at (passed in via created_at by the sweep)
    case "consent_proof":             // anchored to consent_verifications.created_at
      // Anchored to when the record was created/transacted/uploaded
      return context.created_at

    case "platform_account":
      // Anchored to account closure; falls back to created_at
      return context.closed_at ?? context.created_at

    case "consent_log":
      return null  // never erasable — handled before this is called
  }
}

/** Eligible-erasure date for an anchor + policy. Day-exact when retention_days is set (the public
 *  commitment is exactly 90 days, not "3 calendar months" which drifts 89–92d); month model otherwise. */
function eligibleDate(anchor: Date, policy: RetentionPolicy): Date {
  if (typeof policy.retention_days === "number") {
    return new Date(anchor.getTime() + policy.retention_days * 86_400_000)
  }
  return addMonths(anchor, policy.retention_months)
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
