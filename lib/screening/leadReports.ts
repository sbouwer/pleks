/**
 * lib/screening/leadReports.ts — the screening reports an application's LEAD may read: their own, never a co party's
 *
 * Auth:   none of its own — the caller has already proved the lead owns the application (tenant session)
 * Data:   application_screening_lines (read, via the caller's client)
 * Notes:  BUILD_72 invariant (counsel Q7, 2026-10-03): the lead's session can never read a co-applicant's or a
 *         surety's report. A line's subject decides it: `applicant` is a residential lead's own line and `company`
 *         is the entity the lead applied for; `co_applicant` and `guarantor` are other people. Before this module
 *         the tenant screening page read every completed line on the application, with no subject filter.
 *         The storage policy "Applicants can read their own bureau PDFs (not FitScore)" (005 §28.4) carries the
 *         same set, joined through application_screening_lines — the object path has no subject segment, so the
 *         policy cannot tell a lead's PDF from a co party's without it. Change both together.
 */
import type { createServiceClient } from "@/lib/supabase/server"

/** The line subjects that are the lead's own. Mirrored in the 005 §28.4 storage policy. */
const LEAD_REPORT_SUBJECTS = ["applicant", "company"] as const

type Db = Awaited<ReturnType<typeof createServiceClient>>

export type LeadReportLine = { product_key: string; pdf_storage_path: string | null; result_summary: string | null }

/** Completed lines with a PDF for one run, restricted to the lead's own subjects. */
export async function fetchLeadReportLines(
  db: Db,
  args: Readonly<{ orgId: string; applicationId: string; screeningRunId: string }>,
): Promise<{ lines: LeadReportLine[]; error: string | null }> {
  const { data, error } = await db
    .from("application_screening_lines")
    .select("product_key, pdf_storage_path, result_summary")
    .eq("org_id", args.orgId)
    .eq("application_id", args.applicationId)
    .eq("screening_run_id", args.screeningRunId)
    .eq("status", "completed")
    .in("subject_type", LEAD_REPORT_SUBJECTS)
    .not("pdf_storage_path", "is", null)
  if (error) return { lines: [], error: error.message }
  return { lines: data ?? [], error: null }
}
