/**
 * lib/reports/screening/_web/ProvenanceSection.tsx — Doctrine disclaimer + engine provenance chain
 *
 * Mirrors PDF attestation section footer content (§6.11).
 * The four-value provenance chain (engine + prompt + interpretation + inputs hash) enables
 * POPIA s23 replay and Tribunal reconstruction per COMPOSITE.md §1.5 mechanism #5.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.11, Phase F.2.
 */
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { DOCTRINE_DISCLAIMER, SectionLabel } from "./shared"

export function ProvenanceSection({ data }: Readonly<{ data: FitScoreReportData }>) {
  const hashDisplay = data.inputsHash ? data.inputsHash.slice(0, 8) : '—'
  const appRef = data.applicationRef.slice(0, 8)

  return (
    <div className="space-y-4">
      {/* Doctrine */}
      <div className="rounded-lg border border-border p-4 bg-muted/20">
        <p className="text-xs text-muted-foreground leading-relaxed">{DOCTRINE_DISCLAIMER}</p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          This report was generated for internal agent use only. Applicants may request access to their
          information via the POPIA s23 process — contact privacy@pleks.co.za.
        </p>
      </div>

      {/* Provenance chain */}
      <div>
        <SectionLabel>Report Provenance</SectionLabel>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs font-mono">
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Application ref</span>
            <span>{appRef}…</span>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Generated</span>
            <span>{new Date(data.generatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Engine</span>
            <span>{data.engineVersion}</span>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Narrative prompt</span>
            <span>{data.narrativeVersion}</span>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Interpretation</span>
            <span>{data.interpretationVersion}</span>
          </div>
          <div className="flex justify-between border-b border-border py-1.5">
            <span className="text-muted-foreground">Inputs hash</span>
            <span>sha256:{hashDisplay}…</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Agency</span>
            <span>{data.orgName}</span>
          </div>
          {data.orgFfcNumber && (
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">FFC</span>
              <span>{data.orgFfcNumber}</span>
            </div>
          )}
        </div>
      </div>

      {/* How to read link */}
      <p className="text-xs text-muted-foreground">
        How to read this report:{' '}
        <a
          href={`/help/fitscore-report/${data.interpretationVersion}`}
          className="underline hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          /help/fitscore-report/{data.interpretationVersion}
        </a>
      </p>
    </div>
  )
}
