/**
 * lib/applications/__tests__/purgeDocs.test.ts — which files each purge helper reaches, against an in-memory bucket
 *
 * Notes:  Probes both directions. The lead-subject purge must leave every co's `co_{id}/` folder (other people's
 *         documents) and the org purge must reach files nested several levels down — the old top-level list removed
 *         folder names, a no-op, and that passed silently.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  purgeApplicationDocs, purgeSubjectDocs, purgeOrgApplicationDocs, purgeStoragePrefix, eraseLeadDocs,
} from "../purgeDocs"

/** A bucket as a flat set of object paths; `list` returns files and folders one level under the prefix. */
function fakeStorage(paths: string[], opts: { failList?: string } = {}) {
  const objects = new Set(paths)
  const db = {
    storage: {
      from: () => ({
        list: async (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
          if (opts.failList && prefix === opts.failList) return { data: null, error: { message: "boom" } }
          const children = new Map<string, boolean>() // name → isFolder
          for (const p of objects) {
            if (!p.startsWith(`${prefix}/`)) continue
            const rest = p.slice(prefix.length + 1)
            const [head, ...tail] = rest.split("/")
            children.set(head, tail.length > 0 || children.get(head) === true)
          }
          const entries = [...children].sort().map(([name, folder]) => ({ name, id: folder ? null : `id-${name}` }))
          return { data: entries.slice(offset, offset + limit), error: null }
        },
        remove: async (batch: string[]) => {
          for (const p of batch) objects.delete(p)
          return { data: [], error: null }
        },
      }),
    },
  } as unknown as SupabaseClient
  return { db, objects }
}

const APP = "applications/org1/app1"
const TREE = [
  `${APP}/id.pdf`,
  `${APP}/bank_main_aaaaaaaa.pdf`,
  `${APP}/co_c1/id.pdf`,
  `${APP}/co_c2/payslip_bbbbbbbb.pdf`,
  "applications/org1/app2/id.pdf",
  "applications/org2/app3/id.pdf",
]

describe("purgeSubjectDocs — one person's files, never another party's", () => {
  it("the lead's purge removes the root files and LEAVES every co folder", async () => {
    const { db, objects } = fakeStorage(TREE)
    expect(await purgeSubjectDocs(db, "org1", "app1", { kind: "lead" })).toBe(true)
    expect([...objects].sort()).toEqual([
      `${APP}/co_c1/id.pdf`, `${APP}/co_c2/payslip_bbbbbbbb.pdf`,
      "applications/org1/app2/id.pdf", "applications/org2/app3/id.pdf",
    ])
  })

  it("a co's purge removes only its own folder", async () => {
    const { db, objects } = fakeStorage(TREE)
    expect(await purgeSubjectDocs(db, "org1", "app1", { kind: "co", coId: "c1" })).toBe(true)
    expect(objects.has(`${APP}/co_c1/id.pdf`)).toBe(false)
    expect(objects.has(`${APP}/id.pdf`)).toBe(true)
    expect(objects.has(`${APP}/co_c2/payslip_bbbbbbbb.pdf`)).toBe(true)
  })
})

describe("eraseLeadDocs — the DSAR entry point", () => {
  it("erases the lead's root files on every application, leaves co folders, and reports per application", async () => {
    const { db, objects } = fakeStorage(TREE)
    expect(await eraseLeadDocs(db, "org1", ["app1", "app2"])).toEqual({ purged: ["app1", "app2"], failed: [] })
    expect([...objects].sort()).toEqual([
      `${APP}/co_c1/id.pdf`, `${APP}/co_c2/payslip_bbbbbbbb.pdf`, "applications/org2/app3/id.pdf",
    ])
  })

  it("a failed listing is reported as failed, so the caller can abort before the identity strip", async () => {
    const { db } = fakeStorage(TREE, { failList: APP })
    expect(await eraseLeadDocs(db, "org1", ["app1", "app2"])).toEqual({ purged: ["app2"], failed: ["app1"] })
  })
})

describe("recursive purges reach nested files", () => {
  it("purgeApplicationDocs removes the lead's and every co's files, and nothing outside the application", async () => {
    const { db, objects } = fakeStorage(TREE)
    expect(await purgeApplicationDocs(db, "org1", "app1")).toBe(true)
    expect([...objects].sort()).toEqual(["applications/org1/app2/id.pdf", "applications/org2/app3/id.pdf"])
  })

  it("purgeOrgApplicationDocs removes every application of the org — including ones with no row — and no other org's", async () => {
    const { db, objects } = fakeStorage(TREE)
    expect(await purgeOrgApplicationDocs(db, "org1")).toBe(true)
    expect([...objects]).toEqual(["applications/org2/app3/id.pdf"])
  })

  it("a nested {org}/{inspection}/… bucket is emptied — the old top-level list removed nothing here", async () => {
    const { db, objects } = fakeStorage(["org1/insp1/a.jpg", "org1/insp1/signatures/tenant.png", "org2/insp9/b.jpg"])
    expect(await purgeStoragePrefix(db, "inspection-photos", "org1")).toBe(true)
    expect([...objects]).toEqual(["org2/insp9/b.jpg"])
  })

  it("a list failure anywhere in the walk returns false and removes nothing", async () => {
    const { db, objects } = fakeStorage(TREE, { failList: `${APP}/co_c2` })
    expect(await purgeApplicationDocs(db, "org1", "app1")).toBe(false)
    expect(objects.size).toBe(TREE.length)
  })

  it("more than one page of files is removed in full (listing completes before any delete)", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `${APP}/other_${String(i).padStart(3, "0")}.pdf`)
    const { db, objects } = fakeStorage(many)
    expect(await purgeApplicationDocs(db, "org1", "app1")).toBe(true)
    expect(objects.size).toBe(0)
  })
})
