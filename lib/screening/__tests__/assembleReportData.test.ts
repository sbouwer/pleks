/**
 * lib/screening/__tests__/assembleReportData.test.ts — each co row in the FitScore report carries ITS OWN snapshot figures
 *
 * Notes:  Walker F1 (14w-s0d). The orchestrator leaves declined cos out of fitscore_component_snapshot while the report
 *         callers list every co, so a positional join printed a live co's income beside a declined co's name. The join
 *         is by the snapshot's `id`. Both directions: the misaligned shape pairs correctly, and an id-less (legacy)
 *         snapshot keeps the positional pairing it was written for.
 */
import { describe, expect, it } from "vitest"
import { assembleReportData } from "../assembleReportData"

type App = Parameters<typeof assembleReportData>[0]
type Cos = Parameters<typeof assembleReportData>[1]

const snap = (id: string | undefined, income: number, share: number) => ({
  ...(id ? { id } : {}),
  verifiedIncomeCents: income,
  incomeSharePct: share,
  bureauProcessing: { responding: [], outliers: [] },
})

const app = (applicants: unknown[]) => ({
  fitscore_band: "good",
  fitscore: 70,
  fitscore_narrative: {},
  fitscore_components: { affordability: 1, stability: 1, creditBehaviour: null, verificationIntegrity: 1 },
  fitscore_component_snapshot: { applicants },
}) as unknown as App

const cos = [
  { id: "co-declined", first_name: "Declined", last_name: "Party", co_applicant_index: 1 },
  { id: "co-live", first_name: "Live", last_name: "Party", co_applicant_index: 2 },
] as unknown as Cos

const rows = (data: ReturnType<typeof assembleReportData>) =>
  ((data as unknown as { applicants: Array<{ label: string; fullName: string; verifiedIncomeCents: number; incomeSharePct: number }> }).applicants)
    .map((a) => [a.label, a.fullName, a.verifiedIncomeCents, a.incomeSharePct])

describe("assembleReportData — co rows join the snapshot by id", () => {
  it("never prints a live co's income beside a declined co's name; the unscored co is not reported", () => {
    const out = assembleReportData(app([snap("app", 3_000_000, 60), snap("co-live", 2_000_000, 40)]), cos, "Org")
    expect(rows(out)).toEqual([
      ["A", expect.any(String), 3_000_000, 60],
      ["B", "Live Party", 2_000_000, 40],
    ])
  })

  it("carries the snapshot's N-of-M stamp to the report, and null for a snapshot without one (14X row 36)", () => {
    const stamped = app([snap("app", 3_000_000, 60), snap("co-live", 2_000_000, 40)]) as unknown as Record<string, unknown>
    stamped.fitscore_component_snapshot = {
      ...(stamped.fitscore_component_snapshot as object), assessedWith: { n: 2, m: 3, completedSubjectIds: ["app", "co-live"] },
    }
    expect(assembleReportData(stamped as unknown as App, cos, "Org")?.assessedWith).toEqual({ n: 2, m: 3 })
    expect(assembleReportData(app([snap("app", 3_000_000, 100)]), cos, "Org")?.assessedWith).toBeNull()
  })

  it("keeps the positional pairing for a snapshot written without ids", () => {
    const out = assembleReportData(app([snap(undefined, 3_000_000, 60), snap(undefined, 1_000_000, 20), snap(undefined, 1_000_000, 20)]), cos, "Org")
    expect(rows(out).map((r) => r[1])).toEqual([expect.any(String), "Declined Party", "Live Party"])
  })
})
