/**
 * app/(applicant)/apply/co-applicant/[token]/buildCoResume.ts — co UniformApplicant → the lead's ResumeState shape.
 *
 * ADDENDUM_14R Phase 2 (§8.2, sub-step 0). Full-peer co-applicants run the SAME orchestrator/hub the lead runs;
 * the orchestrator rehydrates from a `ResumeState`. This pure helper maps a co's `UniformApplicant` (from the
 * adapter — already decrypted) into that shape so the co page can render `<StepPanel>` instead of the bespoke
 * `CoApplicantSession`. The co's finances/employment live in `section_data` (the co row has no such columns), so we
 * read them from there. `emailVerified` is forced TRUE — the access token IS the email-possession proof (§3), so
 * the co never hits the lead's email-OTP gate. Pure (no I/O) — unit-tested against a UniformApplicant.
 */
import type { ResumeState } from "../../[slug]/useApplyFlow"
import type { UniformApplicant } from "@/lib/applications/applicantAdapter"

/** The shape `CoApplicantSession.submit` writes into `application_co_applicants.section_data`. */
interface CoSectionData {
  addresses?: ResumeState["form"]["addresses"]
  employment_details?: Partial<ResumeState["emp"]>
  income_sources?: ResumeState["incomeSources"]
  expenses?: ResumeState["commitments"]
  dependants?: { adults?: number | null; minors?: number | null; school_fees?: number | null }
}
type SpouseInfo = { isCoApplicant?: boolean; firstName?: string; lastName?: string; idNumber?: string; email?: string } | null

/** Map the decrypted spouse_info into the PartyFormState spouse fields (symmetric of the lead's loadResume). */
function spouseForm(spouse: SpouseInfo): Partial<ResumeState["form"]> {
  if (!spouse) return {}
  if (spouse.isCoApplicant) return { spouseIsCoApplicant: true, spouseEmail: spouse.email }
  return { spouseIsCoApplicant: false, spouseFirstName: spouse.firstName, spouseLastName: spouse.lastName, spouseIdNumber: spouse.idNumber, spouseEmail: spouse.email }
}

export function buildCoResumeState(
  co: UniformApplicant,
  ctx: Readonly<{
    applicationId: string; token: string; docPaths: ResumeState["docPaths"]
    /** the LEAD as a co-shaped candidate — for the "my spouse is the main applicant" option in StepPersonal + the
     *  symmetric s15 link (resolveSpouseInfo). NOT a hub roster entry — the co hub is self-only (isCo guard). */
    spouseCandidate?: ResumeState["coApplicants"][number] | null
  }>,
): ResumeState {
  const sd = (co.sectionData ?? {}) as CoSectionData
  const spouse = co.identity.spouseInfo as SpouseInfo
  return {
    applicationId: ctx.applicationId,
    token: ctx.token,
    // No per-step cursor is persisted for a co yet (14R Phase 2) — the orchestrator forces the hub (atRoster) for a
    // co regardless; open-card walks from identity. A completed co's card simply reads Completed (selfDone).
    step: 0,
    savedAt: co.startedAt,
    applicantType: "individual", // a co is always an individual peer — never the apply-as company/couple chooser
    company: null,
    emailVerified: true, // token-as-proof (§3) — a token-authed co never re-verifies via email OTP
    form: {
      firstName: co.identity.firstName ?? undefined, lastName: co.identity.lastName ?? undefined,
      email: co.identity.email ?? undefined, phone: co.identity.phone ?? undefined,
      idType: co.identity.idType ?? "sa_id", idNumber: co.identity.idNumber ?? undefined, dob: co.identity.dob ?? undefined,
      addresses: (co.identity.addresses as ResumeState["form"]["addresses"]) ?? undefined,
      maritalStatus: co.identity.maritalStatus ?? undefined,
      matrimonialRegime: co.identity.matrimonialRegime ?? undefined,
      ...spouseForm(spouse),
    },
    emp: { employment_type: "", employer: "", start_date: "", ...(sd.employment_details ?? {}) } as ResumeState["emp"],
    dependents: null,
    dependentAdults: sd.dependants?.adults ?? null,
    dependentMinors: sd.dependants?.minors ?? null,
    incomeSources: sd.income_sources ?? [],
    commitments: sd.expenses ?? [],
    // Only the LEAD (for the spouse-link option + s15) — NOT a hub roster (the co hub is self-only via the isCo
    // guard in buildStatusMenuData, so this never surfaces other peers to the co; POPIA §5 holds).
    coApplicants: ctx.spouseCandidate ? [ctx.spouseCandidate] : [],
    docPaths: ctx.docPaths,
    selfDone: co.consentGiven,
  }
}
