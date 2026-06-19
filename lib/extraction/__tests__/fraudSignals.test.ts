/**
 * lib/extraction/__tests__/fraudSignals.test.ts — heuristic fraud signals (ADDENDUM_14L Phase 3)
 *
 * Pins the deterministic signals AND the load-bearing POPIA invariant: a description must NEVER echo a raw
 * ID/account number (§4.5). The embedded-id case is the trap — the signal flags the leak without repeating it.
 */
import { describe, it, expect } from "vitest"
import { detectFraudSignals } from "../fraudSignals"
import type { Document, PipelineDocumentResult } from "../types"

function doc(filename: string, over: Partial<Document> = {}): Document {
  return { path: `/${filename}`, filename, bytes: new Uint8Array(), mimeType: "application/pdf", ...over }
}
const enc = (s: string) => new TextEncoder().encode(s)

describe("detectFraudSignals", () => {
  it("flags a PSD source file", () => {
    const signals = detectFraudSignals([doc("id-card.psd", { format: "psd" })], [])
    expect(signals.some((s) => s.type === "psd-source-detected" && s.severity === "warning")).toBe(true)
  })

  it("flags a 13-digit ID embedded in the filename WITHOUT echoing the digits", () => {
    const idNum = "8708090116088"
    const signals = detectFraudSignals([doc(`${idNum}_Andrea ID Card.pdf`, { format: "pdf" })], [])
    const sig = signals.find((s) => s.type === "embedded-id-in-filename")
    expect(sig).toBeDefined()
    // POPIA invariant: the raw ID number must NOT appear in any description.
    for (const s of signals) expect(s.description.includes(idNum)).toBe(false)
  })

  it("flags PDFs whose metadata names image-editing software", () => {
    const bytes = enc("%PDF-1.4\n<< /Producer (Adobe Photoshop 25.0) /Creator (Acme) >>\n%%EOF")
    const signals = detectFraudSignals([doc("payslip.pdf", { format: "pdf", bytes })], [])
    expect(signals.some((s) => s.type === "editor-software-source")).toBe(true)
  })

  it("does not flag a clean PDF", () => {
    const bytes = enc("%PDF-1.4\n<< /Producer (FNB Statement Generator) >>\n%%EOF")
    const signals = detectFraudSignals([doc("statement.pdf", { format: "pdf", bytes })], [])
    expect(signals.length).toBe(0)
  })

  it("flags low extraction confidence as info", () => {
    const results: PipelineDocumentResult[] = [{ filename: "id.jpg", path: "/id", status: "classified", documentType: "id-document", extractionConfidence: 0.71 }]
    const signals = detectFraudSignals([], results)
    expect(signals.some((s) => s.type === "low-extraction-confidence" && s.severity === "info")).toBe(true)
  })
})
