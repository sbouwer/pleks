/**
 * app/(applicant)/apply/[slug]/applySaveDraft.ts — pure save-draft payload assembly (no React, no network)
 *
 * Notes:  Extracted from applyOrchestrator's saveDraft (14Q increment 0) so the save-draft DATA CONTRACT — primary-
 *         person resolution (on-behalf company → the named director, not the office-manager filler), the school-fees
 *         split, dependents math, spouse_info, employment_details — is a single pure, unit-testable function. The
 *         orchestrator keeps the network call + the email guard + state writes; this builds the request body only.
 */
import {
  type ApplicantType, type CoApplicant, type Emp, type IncomeRow,
  intOrNull, posOrNull, rowMonthlyCents, totalMonthlyCents, incomeSourcesPayload,
} from "./applyDomain"
import type { CompanyInfo } from "./applyCompany"
import type { PartyFormState } from "@/lib/parties/partyValidation"

/** The natural person recorded as the application's PRIMARY. On-behalf company (an office-manager filler who is NOT
 *  the director) → the named director (coApplicants[0]) is primary, so the office manager is never the tenant and the
 *  resume link reaches the director. Every other path's primary is the filler's own form. */
export function resolvePrimary(
  type: ApplicantType | null, companyImDirector: boolean, coApplicants: ReadonlyArray<CoApplicant>, form: PartyFormState,
): { first: string; last: string; email: string; phone: string; id: string; onBehalfCompany: boolean } {
  const onBehalfCompany = type === "company" && !companyImDirector && !!coApplicants[0]
  if (onBehalfCompany) {
    const c = coApplicants[0]
    return { first: c.firstName, last: c.lastName, email: c.email, phone: c.phone, id: c.idNumber, onBehalfCompany }
  }
  return { first: form.firstName ?? "", last: form.lastName ?? "", email: form.email ?? "", phone: form.phone ?? "", id: form.idNumber ?? "", onBehalfCompany }
}

/** spouse_info for the save-draft body — only when married in community of property (s15 MPA). A spouse who is
 *  already a co-applicant is stored as a link (their own flow carries identity + consent); else the external details. */
export function resolveSpouseInfo(form: PartyFormState, coApplicants: ReadonlyArray<CoApplicant>): Record<string, unknown> | null {
  if (form.maritalStatus !== "married" || form.matrimonialRegime !== "in_community") return null
  const candidates = coApplicants.filter((c) => c.role === "co_applicant")
  const spouseIsCo = candidates.length > 0 && (form.spouseIsCoApplicant ?? true)
  if (spouseIsCo) return { isCoApplicant: true, email: candidates.length === 1 ? candidates[0].email : (form.spouseEmail ?? "") }
  return { firstName: form.spouseFirstName ?? "", lastName: form.spouseLastName ?? "", idNumber: form.spouseIdNumber ?? "", email: form.spouseEmail ?? "" }
}

export interface SaveDraftInputs {
  slug: string; applicationId: string | null; token: string | null; stepToSave: number; notify: boolean
  type: ApplicantType | null; companyImDirector: boolean; coApplicants: ReadonlyArray<CoApplicant>
  form: PartyFormState; emp: Emp
  dependentAdults: string; dependentMinors: string
  income: ReadonlyArray<IncomeRow>; commitments: ReadonlyArray<IncomeRow>; company: CompanyInfo
}

/** Build the /api/applications/save-draft request body (pure). The caller resolves + guards the primary email first. */
export function assembleSaveDraftPayload(inp: SaveDraftInputs): Record<string, unknown> {
  const primary = resolvePrimary(inp.type, inp.companyImDirector, inp.coApplicants, inp.form)
  const depA = intOrNull(inp.dependentAdults)
  const depM = intOrNull(inp.dependentMinors)
  const depTotal = (depA ?? 0) + (depM ?? 0)
  // School fees are entered as a commitment line but routed to the child bucket (offset by maintenance) — so the
  // declared obligations the read subtracts EXCLUDE them, and they're passed separately as school_fees.
  const commitments = inp.commitments as IncomeRow[]
  const income = inp.income as IncomeRow[]
  const schoolFeesCents = commitments.filter((r) => r.key === "school_fees").reduce((s, r) => s + rowMonthlyCents(r), 0)
  const commitMonthly = totalMonthlyCents(commitments) - schoolFeesCents
  const { form, emp } = inp
  return {
    slug: inp.slug, applicationId: inp.applicationId, token: inp.token, step: inp.stepToSave, notify: inp.notify,
    first_name: primary.first, last_name: primary.last, email: primary.email, phone: primary.phone,
    id_type: form.idType || "sa_id", id_number: primary.id, date_of_birth: primary.onBehalfCompany ? "" : (form.dob || ""),
    employment_type: emp.employment_type, employer_name: emp.employer, employment_start_date: emp.start_date || "",
    employment_details: {
      contract_end_date: emp.contract_end_date || null, job_title: emp.job_title || null,
      employer_contact_name: emp.employer_contact_name || null, employer_contact_detail: emp.employer_contact_detail || null,
      business_name: emp.business_name || null, business_nature: emp.business_nature || null, trading_since: emp.trading_since || null,
      registered: emp.registered || null, sars_registered: emp.sars_registered || null,
    },
    dependent_adults: depA, dependent_minors: depM, dependents: posOrNull(depTotal),
    school_fees: posOrNull(schoolFeesCents / 100),
    // income_sources is the source of truth; gross_monthly_income (rands) is the derived total — the route
    // re-derives both from income_sources and stores gross_monthly_income_cents (cents).
    gross_monthly_income: String(totalMonthlyCents(income) / 100),
    income_sources: incomeSourcesPayload(income),
    // commitments grid → expenses jsonb; their monthly sum is the declared obligations the read subtracts.
    declared_monthly_obligations: posOrNull(commitMonthly / 100),
    expenses: incomeSourcesPayload(commitments),
    addresses: form.addresses ?? null,
    applicant_type: inp.type,
    company_info: inp.type === "company" ? inp.company : null,
    marital_status: form.maritalStatus || null,
    matrimonial_regime: form.matrimonialRegime || null,
    spouse_info: resolveSpouseInfo(form, inp.coApplicants),
  }
}
