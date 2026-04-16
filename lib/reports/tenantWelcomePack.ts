import { createServiceClient } from "@/lib/supabase/server"
import { resolveDepositInterestConfig } from "@/lib/deposits/interestConfig"
import { describeRate } from "@/lib/deposits/rateUtils"

export interface TenantWelcomePackData {
  // Tenant
  tenantFirstName: string
  tenantName: string
  tenantEmail: string | null
  tenantPhone: string | null
  coTenants: string[]

  // Property & unit
  propertyName: string
  propertyAddress: string
  unitNumber: string

  // Lease
  leaseType: string
  isFixedTerm: boolean
  startDate: string
  endDate: string | null
  rentAmountCents: number
  depositAmountCents: number
  paymentDueDay: string
  escalationPercent: number | null
  escalationReviewDate: string | null
  nextRentCents: number | null
  /** Human-readable deposit interest rate, e.g. "Fixed 5.25% p.a." or "Prime +2.00%" */
  depositRateDescription: string | null
  arrearInterestEnabled: boolean
  arrearInterestMarginPercent: number | null
  noticePeriodDays: number

  // Payment
  paymentReference: string
  trustBankName: string | null
  trustAccountHolder: string | null
  trustAccountNumber: string | null
  trustBranchCode: string | null

  // Portal
  tenantPortalUrl: string | null

  // DebiCheck
  debiCheckStatus: string | null   // "not_set_up" | "active" | "pending" | null

  // Key dates
  cpaNoticeDueBy: string | null
  moveOutNoticeDeadline: string | null
  moveInInspectionDate: string | null

  // Clause summaries (enabled clauses)
  clauseTitles: string[]

  // Generated
  generatedAt: Date
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPaymentReference(
  lastName: string | null,
  companyName: string | null,
  propertyName: string,
  unitNumber: string,
): string {
  const namePart = (companyName ?? lastName ?? "TENANT")
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "")
    .slice(0, 8)
  const propPart = propertyName
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "")
    .slice(0, 4)
  const unitPart = unitNumber
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "")
    .slice(0, 4)
  return `${namePart}-${propPart}-${unitPart}`
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const ORDINAL_SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" }

function formatPaymentDueDay(raw: string | null | undefined): string {
  if (!raw) return "1st of the month"
  if (raw === "last_day") return "last day of the month"
  if (raw === "last_working_day") return "last working day of the month"
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return raw
  const suffix = ORDINAL_SUFFIX[n] ?? "th"
  return `${n}${suffix} of the month`
}

function resolveDebiCheckStatus(
  mandateRow: { status: string } | null,
  leaseMandateStatus: string | null,
): string | null {
  if (mandateRow) {
    return mandateRow.status === "active" || mandateRow.status === "authenticated" ? "active" : "pending"
  }
  if (leaseMandateStatus && leaseMandateStatus !== "not_created") {
    return leaseMandateStatus
  }
  return null
}

function tenantDisplayName(
  firstName: string | null,
  lastName: string | null,
  companyName: string | null,
  entityType: string | null,
): { full: string; first: string } {
  if (entityType === "organisation") {
    const name = companyName ?? "Tenant"
    return { full: name, first: name }
  }
  const full = `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Tenant"
  return { full, first: firstName ?? full }
}

// ── Main data builder ─────────────────────────────────────────────────────────

export async function buildTenantWelcomePackData(
  orgId: string,
  leaseId: string,
  tenantId: string,
): Promise<TenantWelcomePackData> {
  const db = await createServiceClient()

  type LeaseRow = {
    id: string
    unit_id: string | null
    property_id: string | null
    start_date: string
    end_date: string | null
    lease_type: string
    is_fixed_term: boolean
    rent_amount_cents: number
    deposit_amount_cents: number | null
    payment_due_day: string | null
    escalation_percent: number | null
    escalation_review_date: string | null
    arrears_interest_enabled: boolean | null
    arrears_interest_margin_percent: number | null
    notice_period_days: number | null
    debicheck_mandate_status: string | null
    units: {
      unit_number: string
      size_m2: number | null
      properties: {
        name: string
        address_line1: string | null
        suburb: string | null
        city: string | null
      }
    } | null
  }

  type TenantRow = {
    id: string
    first_name: string | null
    last_name: string | null
    company_name: string | null
    entity_type: string | null
    email: string | null
    phone: string | null
  }

  type CoRow = {
    tenant_id: string
    tenants: {
      contacts: {
        first_name: string | null
        last_name: string | null
        company_name: string | null
        entity_type: string | null
      } | null
    } | null
  }

  const [leaseRes, tenantRes, coTenantsRes, bankRes, mandateRes, inspectionRes, clausesRes] =
    await Promise.all([
      db.from("leases")
        .select("id, unit_id, property_id, start_date, end_date, lease_type, is_fixed_term, rent_amount_cents, deposit_amount_cents, payment_due_day, escalation_percent, escalation_review_date, arrears_interest_enabled, arrears_interest_margin_percent, notice_period_days, debicheck_mandate_status, units(unit_number, properties(name, address_line1, suburb, city))")
        .eq("id", leaseId)
        .eq("org_id", orgId)
        .single(),

      db.from("tenant_view")
        .select("id, first_name, last_name, company_name, entity_type, email, phone")
        .eq("id", tenantId)
        .maybeSingle(),

      db.from("lease_co_tenants")
        .select("tenant_id, tenants(contacts(first_name, last_name, company_name, entity_type))")
        .eq("lease_id", leaseId)
        .neq("tenant_id", tenantId),

      db.from("bank_accounts")
        .select("bank_name, account_holder, account_number, branch_code")
        .eq("org_id", orgId)
        .eq("type", "trust")
        .limit(1)
        .maybeSingle(),

      db.from("debicheck_mandates")
        .select("status, billing_day")
        .eq("lease_id", leaseId)
        .in("status", ["authenticated", "active", "pending_authentication"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      db.from("inspections")
        .select("conducted_date, scheduled_date")
        .eq("org_id", orgId)
        .eq("inspection_type", "move_in")
        .order("scheduled_date", { ascending: false })
        .limit(1)
        .maybeSingle(),

      db.from("lease_clause_selections")
        .select("clause_key, enabled")
        .eq("lease_id", leaseId)
        .eq("org_id", orgId)
        .eq("enabled", true),
    ])

  const lease = leaseRes.data as LeaseRow | null
  if (!lease) throw new Error(`Lease ${leaseId} not found`)

  const tenant = tenantRes.data as TenantRow | null
  const { full: tenantName, first: tenantFirstName } = tenantDisplayName(
    tenant?.first_name ?? null,
    tenant?.last_name ?? null,
    tenant?.company_name ?? null,
    tenant?.entity_type ?? null,
  )

  const coTenants = ((coTenantsRes.data ?? []) as unknown as CoRow[])
    .map((r) => {
      const c = r.tenants?.contacts
      if (!c) return null
      return c.entity_type === "organisation"
        ? (c.company_name ?? null)
        : `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null
    })
    .filter((n): n is string => n !== null && n !== "")

  const unit = lease.units
  const property = unit?.properties
  const propertyName = property?.name ?? "Property"
  const propertyAddress = [property?.address_line1, property?.suburb, property?.city].filter(Boolean).join(", ")
  const unitNumber = unit?.unit_number ?? ""

  const bankRow = bankRes.data as { bank_name: string | null; account_holder: string | null; account_number: string | null; branch_code: string | null } | null
  const mandateRow = mandateRes.data as { status: string; billing_day: number | null } | null

  const debiCheckStatus = resolveDebiCheckStatus(mandateRow, lease.debicheck_mandate_status ?? null)

  // Key dates
  const endDate = lease.end_date ?? null
  const noticePeriodDays = lease.notice_period_days ?? 30
  const cpaNoticeDueBy = endDate ? addDays(endDate, -80) : null
  const moveOutNoticeDeadline = endDate ? addDays(endDate, -noticePeriodDays) : null

  const inspRow = inspectionRes.data as { conducted_date: string | null; scheduled_date: string | null } | null
  const moveInInspectionDate = inspRow?.conducted_date ?? inspRow?.scheduled_date ?? null

  // Deposit interest — resolve actual config to get correct rate type description
  const today = new Date().toISOString().slice(0, 10)
  const depositConfig = await resolveDepositInterestConfig(
    orgId,
    lease.property_id ?? null,
    lease.unit_id ?? null,
    today,
  )
  const depositRateDescription = depositConfig ? describeRate(depositConfig) : null

  // Clause titles — map common keys to readable summaries, fallback to clause_key
  const CLAUSE_LABELS: Record<string, string> = {
    pets_allowed: "Pets allowed (with written consent)",
    parking: "Parking bay included",
    smoking_policy: "No smoking on the premises",
    body_corporate_levy: "Body corporate levy applicable",
    special_levy: "Special levy applicable",
    telecommunications: "Telecommunications lines in place",
    outbuilding: "Outbuilding included",
    garden: "Garden maintenance as per lease terms",
    pool: "Pool maintenance responsibility as per lease",
    alarm: "Alarm system — tenant responsibility",
  }

  const clauseTitles = ((clausesRes.data ?? []) as Array<{ clause_key: string }>)
    .map((c) => CLAUSE_LABELS[c.clause_key] ?? c.clause_key.replaceAll("_", " "))

  // Escalation next rent
  const escalationPercent = lease.escalation_percent ? Number(lease.escalation_percent) : null
  const nextRentCents = escalationPercent && lease.rent_amount_cents
    ? Math.round(lease.rent_amount_cents * (1 + escalationPercent / 100))
    : null

  return {
    tenantFirstName,
    tenantName,
    tenantEmail: tenant?.email ?? null,
    tenantPhone: tenant?.phone ?? null,
    coTenants,

    propertyName,
    propertyAddress,
    unitNumber,

    leaseType: lease.lease_type ?? "residential",
    isFixedTerm: lease.is_fixed_term ?? false,
    startDate: lease.start_date,
    endDate,
    rentAmountCents: lease.rent_amount_cents,
    depositAmountCents: lease.deposit_amount_cents ?? 0,
    paymentDueDay: formatPaymentDueDay(lease.payment_due_day),
    escalationPercent,
    escalationReviewDate: lease.escalation_review_date ?? null,
    nextRentCents,
    depositRateDescription,
    arrearInterestEnabled: lease.arrears_interest_enabled ?? false,
    arrearInterestMarginPercent: lease.arrears_interest_margin_percent ? Number(lease.arrears_interest_margin_percent) : null,
    noticePeriodDays,

    paymentReference: buildPaymentReference(tenant?.last_name ?? null, tenant?.company_name ?? null, propertyName, unitNumber),
    trustBankName: bankRow?.bank_name ?? null,
    trustAccountHolder: bankRow?.account_holder ?? null,
    trustAccountNumber: bankRow?.account_number ?? null,
    trustBranchCode: bankRow?.branch_code ?? null,

    tenantPortalUrl: null,

    debiCheckStatus,

    cpaNoticeDueBy,
    moveOutNoticeDeadline,
    moveInInspectionDate,

    clauseTitles,
    generatedAt: new Date(),
  }
}
