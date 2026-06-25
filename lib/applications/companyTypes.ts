/**
 * lib/applications/companyTypes.ts — company-type SSOT shared by the apply UI and the assessment engine
 *
 * Notes:  JURISTIC types are separate legal persons (CIPC/Master registration + AFS + director/trustee surety →
 *         company-net-profit affordability). Everything else (sole proprietor, partnership, other) is
 *         UNINCORPORATED — the human(s) are the applicant → personal affordability. Single source so the apply
 *         flow's branching and assembleAssessment's payer logic can never drift apart.
 */
export const JURISTIC_COMPANY_TYPES = ["pty_ltd", "cc", "npc", "trust"]
export const isJuristicCompanyType = (t: unknown): boolean => typeof t === "string" && JURISTIC_COMPANY_TYPES.includes(t)
