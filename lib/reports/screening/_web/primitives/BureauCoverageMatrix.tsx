/**
 * lib/reports/screening/_web/primitives/BureauCoverageMatrix.tsx — §3.1 bureau coverage matrix
 *
 * Notes:  Web parity for _pdf/primitives/BureauCoverageMatrix.tsx.
 *         3.1 / 3.1.A coverage table + 3.1.B divergence axis (when >= 2 scored bureaus).
 *         3.1.A suffix only when 3.1.B also renders.
 */
import type { JSX } from "react"
import type { FitScoreReportData, BureauEntry } from "@/lib/reports/screening/_primitives/theme"
import { SectionHeader }   from "./SectionHeader"
import { BlockHeader }     from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

function CoveragePips({ filled }: Readonly<{ filled: number }>): JSX.Element {
  return (
    <div className="flex gap-1 mt-1">
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={`pip-${i}`}
          className="w-1.5 h-1.5 rounded-sm"
          style={{ backgroundColor: i < filled ? "#2563eb" : "#e5e7eb", border: i < filled ? "none" : "0.5px solid #d1d5db" }}
        />
      ))}
    </div>
  )
}

function BureauRow({ entry, isLast }: Readonly<{ entry: BureauEntry; isLast: boolean }>): JSX.Element {
  const hasScore = entry.reportedScore !== null
  return (
    <tr className={`${isLast ? "" : "border-b border-border"}`}>
      <td className="px-3 py-2.5">
        <div className="text-sm text-foreground">{entry.name}</div>
        <div className="font-mono text-[9px] text-muted-foreground/60 mt-0.5">{entry.subLabel}</div>
      </td>
      <td className="px-3 py-2.5">
        <CoveragePips filled={entry.coveragePips} />
        <div className="font-mono text-[9px] text-muted-foreground/60 mt-1">{entry.coverageLabel}</div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-sm ${entry.tradeLines === "—" ? "text-muted-foreground" : "text-foreground"}`}>{entry.tradeLines}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-sm ${entry.adverseListings === "—" ? "text-muted-foreground" : "text-foreground"}`}>{entry.adverseListings}</span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`font-mono text-sm ${hasScore ? "text-foreground" : "text-muted-foreground/30"}`}>
          {hasScore ? String(entry.reportedScore) : "—"}
        </span>
      </td>
    </tr>
  )
}

function DivergenceAxis({ entries }: Readonly<{ entries: BureauEntry[] }>): JSX.Element | null {
  const scored = entries.filter((e): e is BureauEntry & { reportedScore: number } => e.reportedScore !== null)
  if (scored.length < 2) return null

  const scores   = scored.map(e => e.reportedScore)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const toPos    = (s: number) => `${((s - 300) / 500) * 100}%`
  const spreadW  = `${((maxScore - minScore) / 500) * 100}%`

  return (
    <div>
      <div className="relative h-9 mb-2">
        {/* Track */}
        <div className="absolute top-5 left-0 right-0 h-px bg-border" />
        {/* Spread */}
        <div
          className="absolute top-[17px] h-[5px] bg-blue-50 border border-blue-200"
          style={{ left: toPos(minScore), width: spreadW }}
        />
        {/* Score markers */}
        {scored.map((e, i) => (
          <div
            key={`m-${i}-${e.name.slice(0, 8)}`}
            className="absolute top-3 w-px h-4 bg-blue-600"
            style={{ left: toPos(e.reportedScore) }}
          />
        ))}
        {/* Score labels */}
        {scored.map((e, i) => (
          <div
            key={`l-${i}-${e.name.slice(0, 8)}`}
            className="absolute top-0 font-mono text-[10px] text-foreground -translate-x-1/2"
            style={{ left: toPos(e.reportedScore) }}
          >
            {e.reportedScore}
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {["300", "400", "500", "600", "700", "800"].map(tick => (
          <span key={`tick-${tick}`} className="font-mono text-[9px] text-muted-foreground/60">{tick}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        <strong className="text-foreground">Divergent bureau profiles observed. </strong>
        Pleks does not interpret this as fraud. Divergence of this magnitude typically resolves
        once an under-reporting bureau receives a missing trade-line update.
        Manual confirmation of one trade-line is recommended before drawing conclusions.
      </p>
    </div>
  )
}

interface BureauCoverageMatrixProps {
  data: FitScoreReportData
}

export function BureauCoverageMatrix({ data }: Readonly<BureauCoverageMatrixProps>): JSX.Element {
  const ca = data.creditAnalysis

  const scored = ca
    ? ca.bureauEntries.filter((e): e is BureauEntry & { reportedScore: number } => e.reportedScore !== null)
    : []
  const showDivergence = scored.length >= 2
  const pts = showDivergence
    ? Math.max(...scored.map(e => e.reportedScore)) - Math.min(...scored.map(e => e.reportedScore))
    : 0

  const coverageLabel = ca
    ? `${ca.bureausResponding} of ${ca.bureausSolicited} responding`
    : data.dimensions.credit.bureauCoverageDisplay

  const matrixLabel = (ca !== undefined && showDivergence) ? "3.1.A" : "3.1"

  return (
    <div className="mb-5">
      <SectionHeader
        badge="3"
        title="Evidence and credit"
        rightLabel={`${coverageLabel} · nightly refresh`}
      />

      <div className="border border-border bg-card mb-2">
        <BlockHeader
          label={matrixLabel}
          title="Coverage matrix · trade-line depth · adverse listings"
          rightTag="refresh · nightly"
        />
        <div className="p-4">
          {ca === undefined ? (
            <PlaceholderCard
              variant="pending"
              message={
                "Detailed bureau entries pending expanded bureau coverage data. " +
                "Coverage summary is available on page 1 in the Credit Behaviour dimension card."
              }
            />
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-border">
                    {[
                      { label: "Bureau",           cls: "text-left" },
                      { label: "Coverage",         cls: "text-left" },
                      { label: "Trade-lines",      cls: "text-left" },
                      { label: "Adverse listings", cls: "text-left" },
                      { label: "Score",            cls: "text-right" },
                    ].map(h => (
                      <th key={h.label} className={`font-mono text-[8px] uppercase tracking-widest text-muted-foreground pb-2 px-3 ${h.cls}`}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ca.bureauEntries.map((entry, i) => (
                    <BureauRow
                      key={`${i}-${entry.name.slice(0, 8)}`}
                      entry={entry}
                      isLast={i === ca.bureauEntries.length - 1}
                    />
                  ))}
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t border-dashed border-border">
                <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
                  <span className="text-foreground">obs. </span>
                  {`Bureau coverage at ${ca.bureausResponding} of ${ca.bureausSolicited}. The FitScore engine de-weighted the credit-behaviour signal proportionally; this is reflected in the Confidence-in-band signal on page 01.`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {ca !== undefined && showDivergence && (
        <div className="border border-border bg-card">
          <BlockHeader label="3.1.B" title="Bureau divergence" rightTag={`${pts} pts`} />
          <div className="p-4">
            <DivergenceAxis entries={ca.bureauEntries} />
          </div>
        </div>
      )}
    </div>
  )
}
