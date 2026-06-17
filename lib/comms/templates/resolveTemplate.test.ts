/**
 * lib/comms/templates/resolveTemplate.test.ts — ADDENDUM_70E resolver gating
 *
 * Covers the resolution invariants: custom fork beats system master; statutory is NEVER flavoured;
 * non-statutory uses the flavour variant when present; null when neither layer exists.
 */

import { describe, it, expect } from "vitest"
import { resolveTemplate, pickBlocks, type TemplateQueryClient } from "./resolveTemplate"
import type { TemplateBlock, TemplateBodyVariants, StoredTemplateRow } from "./blocks/types"

const base: TemplateBlock[] = [{ type: "paragraph", text: "base body" }]
const friendly: TemplateBlock[] = [{ type: "paragraph", text: "friendly body" }]
const firm: TemplateBlock[] = [{ type: "paragraph", text: "firm body" }]
const variants: TemplateBodyVariants = { friendly, firm }

// Mock client whose maybeSingle() pops the next queued result (org fetch first, then system).
function mockClient(results: Array<{ data: StoredTemplateRow | null; error: unknown }>): TemplateQueryClient {
  let i = 0
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => results[i++] ?? { data: null, error: null },
  }
  return { from: () => builder } as unknown as TemplateQueryClient
}

const sysRow = (over: Partial<StoredTemplateRow> = {}): StoredTemplateRow => ({
  comms_class: "correspondence",
  template_key: "k",
  template_type: "email",
  subject: null,
  body_blocks: base,
  body_variants: null,
  ...over,
})

describe("pickBlocks — flavour + statutory floor", () => {
  it("uses the flavour variant for non-statutory when present", () => {
    expect(pickBlocks(sysRow({ body_variants: variants }), "friendly")).toBe(friendly)
  })
  it("NEVER flavours a statutory template (legal correctness > tone)", () => {
    const row = sysRow({ comms_class: "statutory", body_variants: variants })
    expect(pickBlocks(row, "firm")).toBe(base) // base body_blocks, not the firm variant
  })
  it("falls back to body_blocks when the flavour variant is absent", () => {
    expect(pickBlocks(sysRow({ body_variants: { firm } }), "friendly")).toBe(base)
  })
})

describe("resolveTemplate — custom over system, null on miss", () => {
  it("returns the system master when no org custom exists", async () => {
    const db = mockClient([{ data: null, error: null }, { data: sysRow(), error: null }])
    const r = await resolveTemplate(db, { templateKey: "k", channel: "email", orgId: "org" })
    expect(r?.source).toBe("system")
    expect(r?.blocks).toBe(base)
    expect(r?.commsClass).toBe("correspondence")
  })

  it("prefers the org custom fork over the system master", async () => {
    const custom = sysRow({ body_blocks: [{ type: "paragraph", text: "custom body" }] })
    const db = mockClient([{ data: custom, error: null }])
    const r = await resolveTemplate(db, { templateKey: "k", channel: "email", orgId: "org" })
    expect(r?.source).toBe("custom")
    expect(r?.blocks?.[0]).toEqual({ type: "paragraph", text: "custom body" })
  })

  it("returns null when neither layer has the template (caller falls back to the legacy path)", async () => {
    const db = mockClient([{ data: null, error: null }, { data: null, error: null }])
    const r = await resolveTemplate(db, { templateKey: "missing", channel: "email", orgId: "org" })
    expect(r).toBeNull()
  })

  it("returns null on a query error (fail-safe to the React-Email default)", async () => {
    const db = mockClient([{ data: null, error: { message: "boom" } }, { data: null, error: { message: "boom" } }])
    const r = await resolveTemplate(db, { templateKey: "k", channel: "email", orgId: "org" })
    expect(r).toBeNull()
  })
})
