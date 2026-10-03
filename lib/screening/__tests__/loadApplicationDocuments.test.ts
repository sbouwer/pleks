/**
 * lib/screening/__tests__/loadApplicationDocuments.test.ts — the pre-screen reads a co-applicant's files only on that party's own consent
 *
 * Notes:  14W F3 / walker F2 (14w-s0d). The lead's stage-1 consent covers the lead's documents only. Both ways a co's
 *         file reaches the pipeline — a registry row, and an unregistered file in its co_{id}/ folder — are fixtured in
 *         both directions: withheld without consent or once declined, read with consent.
 */
import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadDocuments } from "../loadApplicationDocuments"

const ORG = "org-1"
const APP = "app-1"
const PREFIX = `applications/${ORG}/${APP}`

interface World {
  registry: Array<{ storage_path: string; subject_ref: string }>
  /** Co rows the consent query returns — i.e. ALREADY filtered to consented + not declined, as the DB would. */
  readableCos: string[]
  coQueryFails?: boolean
  /** folder → entries; a folder entry has id null. */
  storage: Record<string, Array<{ name: string; id: string | null }>>
}

function fakeDb(w: World): SupabaseClient {
  const blob = { arrayBuffer: async () => new ArrayBuffer(1) }
  const query = (rows: unknown, error: unknown = null) => {
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "is"]) q[m] = () => q
    q.then = (res: (v: unknown) => unknown) => res({ data: error ? null : rows, error })
    return q
  }
  return {
    from: (table: string) => {
      if (table === "application_documents") return query(w.registry)
      if (table === "application_co_applicants") {
        return query(w.readableCos.map((id) => ({ id })), w.coQueryFails ? { message: "boom" } : null)
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: {
      from: () => ({
        list: async (folder: string) => ({ data: w.storage[folder] ?? [], error: null }),
        download: async () => ({ data: blob, error: null }),
      }),
    },
  } as unknown as SupabaseClient
}

const coFile = `${PREFIX}/co_X/bank_main.pdf`
const base = (readableCos: string[], extra: Partial<World> = {}): World => ({
  registry: [
    { storage_path: `${PREFIX}/payslip.pdf`, subject_ref: "primary" },
    { storage_path: coFile, subject_ref: "co_X" },
  ],
  readableCos,
  storage: {
    [PREFIX]: [{ name: "payslip.pdf", id: "f1" }, { name: "co_X", id: null }, { name: "co_Y", id: null }],
    [`${PREFIX}/co_X`]: [{ name: "bank_main.pdf", id: "f2" }],
    [`${PREFIX}/co_Y`]: [{ name: "unregistered.pdf", id: "f3" }],
  },
  ...extra,
})

const subjects = (docs: Awaited<ReturnType<typeof loadDocuments>>) => docs.map((d) => `${d.subjectRef}:${d.filename}`).sort()

describe("loadDocuments — a co-applicant's files need that party's own consent", () => {
  it("withholds a co's registered AND unregistered files when no co has consented (or all declined)", async () => {
    const docs = await loadDocuments(fakeDb(base([])), ORG, APP)
    expect(subjects(docs)).toEqual(["primary:payslip.pdf"])
  })

  it("reads exactly the consented co's files, and still withholds the other co's folder", async () => {
    const docs = await loadDocuments(fakeDb(base(["X"])), ORG, APP)
    expect(subjects(docs)).toEqual(["co_X:bank_main.pdf", "primary:payslip.pdf"])
  })

  it("reads an unregistered file in a consented co's folder under that co, never as the lead's", async () => {
    const docs = await loadDocuments(fakeDb(base(["Y"])), ORG, APP)
    expect(subjects(docs)).toEqual(["co_Y:unregistered.pdf", "primary:payslip.pdf"])
  })

  it("fails closed: a failed consent read withholds every co file", async () => {
    const docs = await loadDocuments(fakeDb(base(["X", "Y"], { coQueryFails: true })), ORG, APP)
    expect(subjects(docs)).toEqual(["primary:payslip.pdf"])
  })
})
