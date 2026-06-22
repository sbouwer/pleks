/**
 * lib/extraction/fraudSignals.ts — heuristic fraud signals (ADDENDUM_14L Phase 3)
 *
 * Deterministic, format/metadata-based — NO AI (D-14L-09). Descriptions are PII-SAFE by construction: they
 * NEVER echo a raw ID/account number or name (POPIA §4.5). Signals are agent-facing context (14M flag 14
 * routes to manual review) — never an auto-fail.
 *
 * Implemented (cleanly deterministic from what we already have):
 *   psd-source-detected · embedded-id-in-filename · editor-software-source · low-extraction-confidence
 * Deferred (need perceptual / EXIF / PDF-font analysis — a fast-follow, see §4.4):
 *   photo-of-screen · font-inconsistency · scan-rotation-extreme · metadata-author-mismatch
 * Spec: ADDENDUM_14L §4.3/§4.4.
 */
import { detectFormat } from "./formatDetector"
import type { Document, PipelineDocumentResult, FraudSignal } from "./types"

const CONFIDENCE_FLOOR = 0.85
const SA_ID_IN_FILENAME = /\d{13}/   // a 13-digit run = an SA ID number leaked into the filename (D-14L-13)
const EDITOR_SOFTWARE = /(photoshop|gimp|illustrator|inkscape|canva|pixelmator|affinity)/i
// PDF /Producer + /Creator metadata live near the head/tail of the file; scan a bounded slice only.
const SCAN_BYTES = 8192

function pdfEditorSoftware(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null
  const dec = new TextDecoder("latin1")
  const head = dec.decode(bytes.subarray(0, SCAN_BYTES))
  const tail = bytes.length > SCAN_BYTES ? dec.decode(bytes.subarray(bytes.length - SCAN_BYTES)) : ""
  const meta = `${head}\n${tail}`
  if (!/\/(Producer|Creator)/.test(meta)) return null
  const m = EDITOR_SOFTWARE.exec(meta)
  return m ? m[1].toLowerCase() : null
}

/** Zero-AI, format/metadata-only fraud signals (PSD source · embedded ID in filename · editor-software producer).
 *  Needs only the document bytes/filename — no extraction — so it's usable at Step 1 (free readiness) AND composed
 *  into the full Step-2 signal set below. (ADDENDUM_14M three-step funnel, P1c) */
export function metadataFraudSignals(documents: Document[]): FraudSignal[] {
  const signals: FraudSignal[] = []
  for (const doc of documents) {
    const format = doc.format ?? detectFormat(doc.filename, doc.bytes)
    if (format === "psd") {
      signals.push({ type: "psd-source-detected", severity: "warning", documentPath: doc.path, description: "Layered Photoshop (PSD) source — documents should be a final PDF/JPEG/PNG, not an editable source file." })
    }
    if (SA_ID_IN_FILENAME.test(doc.filename)) {
      signals.push({ type: "embedded-id-in-filename", severity: "warning", documentPath: doc.path, description: "A 13-digit number (likely an ID) appears in the filename — advise the applicant on data hygiene." })
    }
    if (format === "pdf") {
      const editor = pdfEditorSoftware(doc.bytes)
      if (editor) signals.push({ type: "editor-software-source", severity: "warning", documentPath: doc.path, description: `PDF metadata names image-editing software (${editor}) as the producer — possible re-export of an edited document.` })
    }
  }
  return signals
}

export function detectFraudSignals(
  documents: Document[],
  results: PipelineDocumentResult[],
): FraudSignal[] {
  // Zero-AI metadata signals + the extraction-gated low-confidence signal (Step-2 only — needs extraction).
  const signals = metadataFraudSignals(documents)

  for (const r of results) {
    if (typeof r.extractionConfidence === "number" && r.extractionConfidence < CONFIDENCE_FLOOR) {
      signals.push({ type: "low-extraction-confidence", severity: "info", documentPath: r.path, description: `Extraction confidence ${r.extractionConfidence.toFixed(2)} is below the ${CONFIDENCE_FLOOR} threshold — fields may be unreliable.` })
    }
  }

  return signals
}
