/**
 * app/api/applications/[id]/documents/__tests__/applicant-docs-gate.test.ts — the applicant document routes after
 * application-docs became service-role only (DECISIONS 2026-10-03)
 *
 * Notes:  Probed both ways. Consent: an image reaches the processor only with the subject's recorded stage-1
 *         consent — without it no createMessage call; with it, one (so a gate that blocked everything cannot pass).
 *         Subject binding: a co token reaches its own co_ folder and not the lead's file, for detect-document,
 *         upload-url and remove alike; an own-folder path goes through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ResolvedApplicant } from "@/lib/applications/verifyApplicantToken"

const ORG = "org-1"
const APP = "app-1"
const ROOT = `applications/${ORG}/${APP}`

const h = vi.hoisted(() => ({
  caller: null as unknown,
  storage: { download: vi.fn(), createSignedUploadUrl: vi.fn(), remove: vi.fn() },
  createMessage: vi.fn(),
}))

const chain: Record<string, unknown> = {}
for (const m of ["select", "eq", "is", "update", "insert"]) chain[m] = vi.fn(() => chain)
chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { org_id: ORG }, error: null }))
const service = { from: vi.fn(() => chain), storage: { from: vi.fn(() => h.storage) } }

vi.mock("@/lib/applications/verifyApplicantToken", () => ({ resolveApplicantToken: vi.fn(async () => h.caller) }))
vi.mock("@supabase/supabase-js", () => ({ createClient: () => service }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => service }))
vi.mock("@/lib/env", () => ({ SUPABASE_URL: "https://example.test", requireEnv: () => "k", optionalEnv: () => undefined }))
vi.mock("@/lib/ai/client", () => ({ createMessage: h.createMessage }))
vi.mock("@/lib/ai/rateLimit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }))
vi.mock("@/lib/applications/documentRegistry", () => ({ registerApplicationDocument: vi.fn(), retireApplicationDocument: vi.fn() }))

import { POST as detect } from "../../detect-document/route"
import { POST as uploadUrl } from "../upload-url/route"
import { POST as remove } from "../remove/route"

const LEAD = (consent: boolean): ResolvedApplicant => ({ subject: { kind: "lead" }, stage1ConsentGiven: consent })
const CO = (consent: boolean): ResolvedApplicant => ({ subject: { kind: "co", coId: "c1" }, stage1ConsentGiven: consent })
const req = (body: unknown) => new Request("https://example.test", { method: "POST", body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: APP }) }

beforeEach(() => {
  vi.clearAllMocks()
  h.storage.download.mockResolvedValue({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null })
  h.storage.createSignedUploadUrl.mockImplementation(async (path: string) => ({ data: { path, token: "t" }, error: null }))
  h.storage.remove.mockResolvedValue({ error: null })
  h.createMessage.mockResolvedValue({ message: { content: [{ type: "text", text: '{"document_type":"sa_id","confidence":0.9,"details":"ID"}' }] } })
})

describe("detect-document — no bytes to the processor before a recorded stage-1 consent", () => {
  it("an image WITHOUT consent never reaches createMessage", async () => {
    h.caller = LEAD(false)
    const res = await detect(req({ path: `${ROOT}/id.jpg`, docKey: "id", token: "tok" }) as never, params)
    expect(res.status).toBe(200)
    expect(h.createMessage).not.toHaveBeenCalled()
  })

  it("KNOWN-GOOD: the same image WITH consent does", async () => {
    h.caller = LEAD(true)
    await detect(req({ path: `${ROOT}/id.jpg`, docKey: "id", token: "tok" }) as never, params)
    expect(h.createMessage).toHaveBeenCalledTimes(1)
  })

  it("a co token naming the lead's file is refused before any download", async () => {
    h.caller = CO(true)
    const res = await detect(req({ path: `${ROOT}/id.jpg`, docKey: "id", token: "tok" }) as never, params)
    expect(res.status).toBe(403)
    expect(h.storage.download).not.toHaveBeenCalled()
  })
})

describe("upload-url — the server builds the path in the caller's own folder", () => {
  it("a co gets a path in its own co_ folder", async () => {
    h.caller = CO(false)
    const res = await uploadUrl(req({ token: "tok", docKey: "bank_main", ext: "pdf", single: true }), params)
    expect(res.status).toBe(200)
    expect(h.storage.createSignedUploadUrl).toHaveBeenCalledWith(`${ROOT}/co_c1/bank_main.pdf`, { upsert: true })
  })

  it("an unlisted slot or a foreign extension mints nothing", async () => {
    h.caller = LEAD(false)
    expect((await uploadUrl(req({ token: "tok", docKey: "../../x", ext: "pdf", single: true }), params)).status).toBe(400)
    expect((await uploadUrl(req({ token: "tok", docKey: "bank_main", ext: "html", single: true }), params)).status).toBe(400)
    expect(h.storage.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it("no token, no URL", async () => {
    h.caller = null
    expect((await uploadUrl(req({ docKey: "bank_main", ext: "pdf", single: true }), params)).status).toBe(401)
    expect(h.storage.createSignedUploadUrl).not.toHaveBeenCalled()
  })
})

describe("remove — own folder only", () => {
  it("a co removing the lead's file is refused", async () => {
    h.caller = CO(false)
    expect((await remove(req({ token: "tok", path: `${ROOT}/bank_main.pdf` }), params)).status).toBe(403)
    expect(h.storage.remove).not.toHaveBeenCalled()
  })

  it("KNOWN-GOOD: a co removing its own file goes through", async () => {
    h.caller = CO(false)
    expect((await remove(req({ token: "tok", path: `${ROOT}/co_c1/bank_main.pdf` }), params)).status).toBe(200)
    expect(h.storage.remove).toHaveBeenCalledWith([`${ROOT}/co_c1/bank_main.pdf`])
  })
})
