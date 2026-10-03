/**
 * test/db/lead-report-isolation.dbtest.ts — the lead's session reads only the lead's own reports (counsel Q7)
 *
 * Auth:   service client (the tenant screening page reads through it after proving the lead owns the application)
 * Data:   seeds one application with completed, PDF-bearing lines for every subject type, on the real schema
 * Notes:  BUILD_72 invariant, 2026-10-03: the lead's session can never read a co-applicant's or surety's report.
 *         Runs `fetchLeadReportLines` — the page's only read of report paths — against real rows. Both directions:
 *         the lead's `applicant` and `company` lines come back; `co_applicant` and `guarantor` lines never do, a
 *         different run or an incomplete line never does, and another org's line on the same ids never does.
 *         The storage policy half (005 §28.4) is skipped on a local stack (it needs the storage_admin owner), so it
 *         is verified against the hosted policy definition after apply, not here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"
import { fetchLeadReportLines } from "@/lib/screening/leadReports"

const db = svc()
let orgId = ""
let otherOrgId = ""
let appId = ""
const runId = randomUUID()

async function line(org: string, subjectType: string, productKey: string, extra: Record<string, unknown> = {}) {
  const { error } = await db.from("application_screening_lines").insert({
    org_id: org, application_id: appId, subject_type: subjectType, subject_id: randomUUID(), product_key: productKey,
    status: "completed", screening_run_id: runId, pdf_storage_path: `${org}/${appId}/${productKey}/t-${subjectType}.pdf`,
    ...extra,
  })
  if (error) throw new Error(`seed line ${subjectType}: ${error.message}`)
}

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  const { data: listing, error: lErr } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (lErr) throw new Error(`seed listing: ${lErr.message}`)
  const { data: app, error: aErr } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listing.id, unit_id: s.unitId, first_name: "Lead", last_name: "Probe",
      applicant_email: `lead-${randomUUID()}@example.test`, stage1_status: "shortlisted", stage2_status: "invited" })
    .select("id").single()
  if (aErr) throw new Error(`seed application: ${aErr.message}`)
  appId = app.id as string

  await line(orgId, "applicant", "combined_consumer_credit_report")
  await line(orgId, "company", "cipc_company")
  await line(orgId, "co_applicant", "combined_consumer_credit_report")
  await line(orgId, "guarantor", "combined_consumer_credit_report")
  await line(orgId, "applicant", "vccb_income_estimator", { status: "running" })          // not complete
  await line(orgId, "applicant", "compuscan_company_profile", { screening_run_id: randomUUID() }) // another run

  const other = await seedLedgerCase(db, { invoices: [] })
  otherOrgId = other.orgId
  await line(otherOrgId, "applicant", "other_org_product") // same application id, foreign org — never returned
}, 60_000)

afterAll(() => {
  if (orgId) teardownOrg(orgId)
  if (otherOrgId) teardownOrg(otherOrgId)
})

describe("lead report isolation (counsel Q7)", () => {
  it("returns the lead's own completed lines for the run — applicant and company — and nothing else", async () => {
    const { lines, error } = await fetchLeadReportLines(db as never, { orgId, applicationId: appId, screeningRunId: runId })
    expect(error).toBeNull()
    expect(lines.map((l) => l.pdf_storage_path).sort()).toEqual([
      `${orgId}/${appId}/cipc_company/t-company.pdf`,
      `${orgId}/${appId}/combined_consumer_credit_report/t-applicant.pdf`,
    ])
  })

  it("never returns a co-applicant's or a surety's report, though both are completed PDFs on the same run", async () => {
    const { lines } = await fetchLeadReportLines(db as never, { orgId, applicationId: appId, screeningRunId: runId })
    expect(lines.some((l) => /t-(co_applicant|guarantor)\.pdf$/.test(l.pdf_storage_path ?? ""))).toBe(false)
  })

  it("the storage policy's predicate admits the lead's own objects and refuses a co party's, an unknown path and FitScore", async () => {
    const check = async (name: string) => {
      const { data, error } = await db.rpc("is_lead_report_object", { p_name: name })
      expect(error).toBeNull()
      return data as boolean
    }
    expect(await check(`${orgId}/${appId}/combined_consumer_credit_report/t-applicant.pdf`)).toBe(true)
    expect(await check(`${orgId}/${appId}/cipc_company/t-company.pdf`)).toBe(true)
    expect(await check(`${orgId}/${appId}/combined_consumer_credit_report/t-co_applicant.pdf`)).toBe(false)
    expect(await check(`${orgId}/${appId}/combined_consumer_credit_report/t-guarantor.pdf`)).toBe(false)
    expect(await check(`${orgId}/${appId}/fitscore-report.pdf`)).toBe(false) // no line owns it
  })

  it("KNOWN-GOOD: the co and guarantor lines exist — the exclusion is the filter, not an empty seed", async () => {
    const { data, error } = await db.from("application_screening_lines").select("subject_type")
      .eq("org_id", orgId).eq("application_id", appId).eq("screening_run_id", runId).eq("status", "completed")
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.subject_type).sort()).toEqual(["applicant", "co_applicant", "company", "guarantor"])
  })
})
