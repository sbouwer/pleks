/**
 * lib/applications/reviewMasking.ts — the ONE authority for what's masked between applicants (ADDENDUM_14R §5).
 *
 * A rental application is JOINT: every applicant sees the shared financial review (incomes, combined affordability,
 * who covers what, completion) — that's the point of applying together, and it's consent-disclosed at join. But
 * three classes stay private BETWEEN applicants (data-minimisation + regulated): raw ID numbers, bank account
 * numbers, and the credit/bureau report. The AGENT/landlord sees everything unmasked.
 *
 * This is the single seam so the agent surface and the applicant surface can't drift: every site that could render
 * one of the three classes routes through here with its audience. Today the Stage-1 review carries none of them
 * (it's all aggregates/decoded signals) — this exists so that the moment a per-party or raw field is added, masking
 * is enforced by construction rather than retrofitted.
 */
import { maskIdNumber } from "@/lib/crypto/idNumber"

/** Who is looking at the review. "peer" = ANY applicant (the lead is a peer too — §5 masks BETWEEN applicants);
 *  "agent" = the managing agent / landlord, who sees everything. */
export type ReviewAudience = "agent" | "peer"

/** Mask a bank account number for a peer — last 4 digits only. The agent sees it whole. */
export function maskBankAccount(raw: string | null | undefined): string {
  const v = (raw ?? "").replace(/\s/g, "")
  if (!v) return "—"
  if (v.length <= 4) return "••••"
  return `••••${v.slice(-4)}`
}

/** Mask a raw ID number / bank account number for the given audience. A peer sees the masked form; the agent sees
 *  the raw value. (The credit/bureau report is NOT masked-but-shown — it's OMITTED for peers; see canSeeCredit.) */
export function maskForAudience(audience: ReviewAudience, field: "id_number" | "bank_account", raw: string | null | undefined): string {
  if (audience === "agent") return (raw ?? "").trim() || "—"
  if (field === "bank_account") return maskBankAccount(raw)
  return raw ? maskIdNumber(raw) : "—"
}

/** Whether the credit/bureau report (FitScore / Searchworx) may be shown. Agent only — a peer never sees another
 *  applicant's regulated consumer-credit document, even within a couple. Call sites OMIT the field when false. */
export function canSeeCredit(audience: ReviewAudience): boolean {
  return audience === "agent"
}
