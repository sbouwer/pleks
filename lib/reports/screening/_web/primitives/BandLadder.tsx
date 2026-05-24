/**
 * lib/reports/screening/_web/primitives/BandLadder.tsx — band ladder + three signals panel
 *
 * Notes:  Web parity for _pdf/primitives/BandLadder.tsx.
 *         Left: 6-rung ladder with current band highlighted. Right: confidence, VI, flags signals.
 */
import type { JSX } from "react"
import { BAND_LABELS, GRADE_LABELS, colors } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreReportData, FitScoreBand, ConfidenceGrade, VerificationIntegrityGrade, MaterialFlag } from "@/lib/reports/screening/_primitives/theme"
import { toDocAnchorId } from "@/lib/reports/screening/_primitives/anchors"

const RUNGS: { key: FitScoreBand; num: string; range: string }[] = [
  { key: "verified_stability",   num: "01", range: "86-100" },
  { key: "stable_profile",       num: "02", range: "70-85"  },
  { key: "cautious_review",      num: "03", range: "55-69"  },
  { key: "limited_confidence",   num: "04", range: "40-54"  },
  { key: "adverse_signals",      num: "05", range: "0-39"   },
  { key: "limited_data_profile", num: "06", range: "n/c"    },
]

const CONFIDENCE_QUALIFIER: Record<ConfidenceGrade, string> = {
  high:         "strong evidence position across all dimensions",
  medium:       "sufficient evidence to position, some gaps remain",
  low:          "limited evidence; result is provisional",
  insufficient: "Evidence insufficient for comparative placement",
}

const VI_QUALIFIER: Record<VerificationIntegrityGrade, string> = {
  high:    "all primary sources reconciled",
  medium:  "minor gaps in cross-source reconciliation",
  low:     "notable gaps in verification coverage",
  limited: "verification coverage is limited",
}

const TIER_FILLED: Record<string, number> = {
  high: 4, medium: 2, low: 1, insufficient: 0, limited: 0,
}

function rungNameColor(isCurrent: boolean, isOut: boolean): string {
  if (isCurrent) return "#111827"
  if (isOut)     return "#d1d5db"
  return "#9ca3af"
}

function tickBg(i: number, filled: number): string {
  if (i >= filled)         return "#d1d5db"
  if (i === filled - 1)   return "#d97706"
  return "#111827"
}

function TierBar({ grade }: Readonly<{ grade: string }>): JSX.Element {
  const filled = TIER_FILLED[grade] ?? 0
  return (
    <div className="flex gap-1 mt-2">
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          className="flex-1 h-1 rounded-sm"
          style={{ backgroundColor: tickBg(i, filled) }}
        />
      ))}
    </div>
  )
}

function Signal({ label, docRef, grade, qualifier }: Readonly<{
  label: string; docRef?: string; grade: string; qualifier: string
}>): JSX.Element {
  return (
    <div className="border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
        {docRef !== undefined && (
          <a href={`#${toDocAnchorId(docRef)}`} className="font-mono text-[9px] text-muted-foreground/60 hover:text-foreground">§{docRef}</a>
        )}
      </div>
      <div className="font-bold text-base text-foreground leading-tight mb-0.5">{GRADE_LABELS[grade] ?? grade}</div>
      <div className="font-mono text-[9px] text-muted-foreground leading-snug">{qualifier}</div>
      <TierBar grade={grade} />
    </div>
  )
}

function flagPillCls(cls: MaterialFlag["class"]): { border: string; text: string; bg: string; dot: string } {
  if (cls === "critical") return { border: "#111827", text: "#111827", bg: "#ffffff", dot: "#d97706" }
  if (cls === "trust")    return { border: "#3b82f6", text: "#4b5563", bg: "#eff6ff", dot: "#93c5fd" }
  return { border: "#d1d5db", text: "#6b7280", bg: "#ffffff", dot: "#9ca3af" }
}

function FlagSignal({ data }: Readonly<{ data: FitScoreReportData }>): JSX.Element {
  return (
    <div className="border border-border bg-card px-3 py-2.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-2">Material flags</span>
      {data.materialFlags.length === 0 ? (
        <span className="text-xs text-muted-foreground/50">No material flags.</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {data.materialFlags.map((flag, i) => {
            const c = flagPillCls(flag.class)
            return (
              <span
                key={`${flag.flag}-${i}`}
                className="inline-flex items-center gap-1.5 font-mono text-[9px] px-2 py-0.5 rounded border"
                style={{ borderColor: c.border, color: c.text, backgroundColor: c.bg }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                {flag.description}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface BandLadderProps {
  data: FitScoreReportData
}

export function BandLadder({ data }: Readonly<BandLadderProps>): JSX.Element {
  const currentBand = data.band
  const bandColors  = colors.band[currentBand]
  const scoreDisplay = data.score === null ? "Score n/c" : `Score ${data.score} / 100`

  const LADDER_BANDS: FitScoreBand[] = [
    "verified_stability", "stable_profile", "cautious_review",
    "limited_confidence", "adverse_signals", "limited_data_profile",
  ]
  const currentIdx = LADDER_BANDS.indexOf(currentBand)

  return (
    <div className="flex gap-4 mb-5">
      {/* Left: band card */}
      <div className="flex-[1.35] border border-border bg-card px-3 py-3">
        <div className="flex items-baseline justify-between mb-3">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Profile band</span>
          <span className="font-mono text-[10px] text-muted-foreground">{scoreDisplay}</span>
        </div>

        <div className="border-t border-border mb-3">
          {RUNGS.map(rung => {
            const isCurrent  = rung.key === currentBand
            const rungIdx    = LADDER_BANDS.indexOf(rung.key)
            const isOut      = currentIdx >= 0 && rungIdx >= 0 && rungIdx !== currentIdx
            const nameColor  = rungNameColor(isCurrent, isOut)
            return (
              <div
                key={rung.key}
                className={`flex items-center gap-2.5 py-1.5 px-0 pr-1 border-b border-border text-[12px] ${isCurrent ? "pl-2.5 border-l-2 -ml-0.5 bg-muted/20" : ""}`}
                style={isCurrent ? { borderLeftColor: "#d97706" } : undefined}
              >
                <span
                  className="font-mono text-[9px] w-5 shrink-0"
                  style={{ color: isCurrent ? "#d97706" : "#9ca3af" }}
                >{rung.num}</span>
                <span
                  className="flex-1 text-[12px]"
                  style={{ color: nameColor, fontWeight: isCurrent ? "700" : "400" }}
                >{BAND_LABELS[rung.key]}</span>
                <span
                  className="font-mono text-[9px]"
                  style={{ color: isCurrent ? "#111827" : "#9ca3af" }}
                >{rung.range}</span>
              </div>
            )
          })}
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          The band describes the{" "}
          <span className="font-semibold text-foreground">observed evidence state</span>
          {" "}across affordability, stability, credit behaviour, and verification integrity. The numeric score is metadata for cross-report comparability. It is not a decision.
        </div>
      </div>

      {/* Right: signals */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Band badge — web addition for context */}
        <div
          className="inline-flex items-center self-start px-3 py-1 rounded text-sm font-semibold mb-1"
          style={{ color: bandColors.text, backgroundColor: bandColors.bg }}
        >
          {BAND_LABELS[currentBand]}
        </div>

        <Signal
          label="Band placement confidence"
          grade={data.confidenceIndex}
          qualifier={CONFIDENCE_QUALIFIER[data.confidenceIndex] ?? ""}
        />
        <Signal
          label="Verification integrity"
          docRef="3.2"
          grade={data.verificationIntegrity}
          qualifier={VI_QUALIFIER[data.verificationIntegrity] ?? ""}
        />
        <FlagSignal data={data} />
      </div>
    </div>
  )
}
