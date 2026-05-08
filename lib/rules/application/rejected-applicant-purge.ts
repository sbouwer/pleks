/**
 * lib/rules/application/rejected-applicant-purge.ts — PAIA 90-day PII purge rule
 *
 * Notes:  Purges personal information for rejected applicants older than 90 days.
 *         Fulfils the public commitment in the PAIA Manual (B4 retention schedule).
 *         Covers both Stage 1 (not_shortlisted) and Stage 2 (declined) rejections.
 *         Idempotent: pii_purged_at IS NULL guard prevents double-processing.
 */
import type { OrgRule } from "../types"

const NINETY_DAYS_MS = 90 * 86_400_000

export const rejectedApplicantPurgeRule: OrgRule = {
  id:          "rejected-applicant-purge",
  domain:      "application",
  description: "Purge PII for rejected applicants older than 90 days — PAIA public commitment",
  scope:       "org",
  frequency:   "daily",
  tags:        ["paia", "popia", "purge", "compliance"],

  async condition({ supabase, org, now }) {
    const cutoff = new Date(now.getTime() - NINETY_DAYS_MS).toISOString()
    const { count, error } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .is("pii_purged_at", null)
      .or(
        `and(stage2_status.eq.declined,reviewed_at.lt.${cutoff}),` +
        `and(stage1_status.eq.not_shortlisted,prescreened_at.lt.${cutoff})`
      )
    if (error) console.error("[rejected-applicant-purge] condition query failed:", error.message)
    return (count ?? 0) > 0
  },

  async action({ supabase, org, now }) {
    const cutoff = new Date(now.getTime() - NINETY_DAYS_MS).toISOString()
    const { data: candidates, error } = await supabase
      .from("applications")
      .select("id, bank_statement_path")
      .eq("org_id", org.id)
      .is("pii_purged_at", null)
      .or(
        `and(stage2_status.eq.declined,reviewed_at.lt.${cutoff}),` +
        `and(stage1_status.eq.not_shortlisted,prescreened_at.lt.${cutoff})`
      )

    if (error) {
      console.error("[rejected-applicant-purge] candidate fetch failed:", error.message)
      return { summary: "Candidate fetch failed", count: 0 }
    }
    if (!candidates?.length) return { summary: "No eligible applicants", count: 0 }

    const purgedIds: string[] = []

    for (const { id, bank_statement_path } of candidates) {
      // Remove Storage objects — best-effort, do not abort on storage failure
      if (bank_statement_path) {
        await supabase.storage.from("bank-statements").remove([bank_statement_path]).catch(() => undefined)
      }
      // Identity docs folder (org_id/application_id prefix convention)
      await supabase.storage.from("identity-docs").remove([`${org.id}/${id}`]).catch(() => undefined)

      const { error: updateErr } = await supabase
        .from("applications")
        .update({
          id_number:               null,
          gross_monthly_income_cents: null,
          employer_name:           null,
          bank_statement_path:     null,
          searchworx_extracted_data: null,
          pii_purged_at:           now.toISOString(),
        })
        .eq("id", id)

      if (updateErr) {
        console.error(`[rejected-applicant-purge] update failed for ${id}:`, updateErr.message)
      } else {
        purgedIds.push(id)
      }
    }

    return {
      summary: `Purged PII for ${purgedIds.length} rejected applicant(s)`,
      count:   purgedIds.length,
      data:    { purged_count: purgedIds.length },
    }
  },
}
