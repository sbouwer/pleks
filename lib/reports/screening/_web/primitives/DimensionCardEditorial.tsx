/**
 * lib/reports/screening/_web/primitives/DimensionCardEditorial.tsx — dimensional score cards
 *
 * Notes:  Web parity for _pdf/primitives/DimensionCardEditorial.tsx.
 *         Three-case methodology dispatch (D-DSP-15/20/21):
 *           all-foreign + not LDP → three-card row at w-1/3;
 *           LDP → 2×2 with notAssessed placeholders;
 *           all-SA or mixed → 2×2; Credit card carries reduced-coverage note for mixed leases.
 *         EvidenceBar with preferred-threshold marker. Observation bullets from narrative.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { toDocAnchorId } from "@/lib/reports/screening/_primitives/anchors"
import { PlaceholderCard } from "./PlaceholderCard"

const NOT_ASSESSED_MSG = "Insufficient verified evidence available for this dimension."

function EvidenceBar({ score, preferred }: Readonly<{ score: number; preferred: number }>): JSX.Element {
  const pct       = Math.max(0, Math.min(100, score))
  const prefPct   = Math.max(0, Math.min(100, preferred))
  const isSurplus = pct > prefPct
  const isDeficit = pct < prefPct
  const showLabel = pct >= prefPct

  return (
    <div className="mb-2">
      <div className="relative h-1.5 bg-paper-sunk border border-border rounded-sm">
        <div
          className="absolute left-0 top-0 bottom-0 bg-blue-300 rounded-sm"
          style={{ width: `${Math.min(pct, prefPct)}%` }}
        />
        {isSurplus && (
          <div
            className="absolute top-0 bottom-0 bg-blue-600 rounded-sm"
            style={{ left: `${prefPct}%`, width: `${pct - prefPct}%` }}
          />
        )}
        {isDeficit && (
          <div
            className="absolute top-0 bottom-0 bg-amber-400/50 rounded-sm"
            style={{ left: `${pct}%`, width: `${prefPct - pct}%` }}
          />
        )}
        <div
          className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-amber-600"
          style={{ left: `${prefPct}%` }}
        />
        <div
          className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-amber-500"
          style={{ left: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-end mt-0.5" style={{ width: `${prefPct}%` }}>
          <span className="font-mono text-[8px] text-amber-700">min. preferred</span>
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value, muted = false }: Readonly<{
  label: string; value: string; muted?: boolean
}>): JSX.Element {
  return (
    <div className="flex items-baseline justify-between mb-1 last:mb-0">
      <span className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground flex-1">{label}</span>
      <span className={`font-mono text-[11px] ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  )
}

function ObsBullets({ bullets }: Readonly<{ bullets: string[] }>): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {bullets.map((b, i) => (
        <div key={`${i}-${b.slice(0, 16)}`} className="flex gap-1.5 items-start">
          <span className="font-mono text-[10px] text-muted-foreground/30 mt-px shrink-0">·</span>
          <span className="text-[11px] text-muted-foreground leading-relaxed">{b}</span>
        </div>
      ))}
    </div>
  )
}

function AffordabilityBody({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>): JSX.Element {
  const dim = data.dimensions.affordability
  return (
    <div>
      <p className="font-bold text-sm text-foreground leading-snug mb-2 min-h-[60px]">{data.narrative.affordabilityEvidenceLine}</p>
      <div className="border-t border-b border-border py-2 mb-2">
        <StatRow label="Score"  value={String(score)} />
        <StatRow label="Rent"   value={`${dim.rentToIncomePct}% of income`} muted />
        <StatRow label="Window" value={`${dim.windowMonths} months`}        muted />
      </div>
      <EvidenceBar score={score} preferred={data.dimensionalScores.affordability_preferred_threshold} />
      <ObsBullets bullets={data.narrative.affordabilityObservations} />
    </div>
  )
}

function StabilityBody({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>): JSX.Element {
  const dim = data.dimensions.stability
  return (
    <div>
      <p className="font-bold text-sm text-foreground leading-snug mb-2 min-h-[60px]">{data.narrative.stabilityEvidenceLine}</p>
      <div className="border-t border-b border-border py-2 mb-2">
        <StatRow label="Score"          value={String(score)} />
        <StatRow label="Current tenure" value={dim.currentTenureDisplay}  muted />
        <StatRow label="Employers (7y)" value={String(dim.employersIn7Years)} muted />
      </div>
      <EvidenceBar score={score} preferred={data.dimensionalScores.stability_preferred_threshold} />
      <ObsBullets bullets={data.narrative.stabilityObservations} />
    </div>
  )
}

function CreditBody({ data }: Readonly<{ data: FitScoreReportData }>): JSX.Element {
  const score = data.dimensionalScores.creditBehaviour
  if (score === null) return <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
  const dim        = data.dimensions.credit
  const divDisplay = dim.divergencePoints === null ? "None" : String(dim.divergencePoints)
  const isMixed    = data.applicants.some(a => a.isForeignNational) && !data.isAllForeignNational
  return (
    <div>
      <p className="font-bold text-sm text-foreground leading-snug mb-2 min-h-[60px]">{data.narrative.creditEvidenceLine}</p>
      <div className="border-t border-b border-border py-2 mb-2">
        <StatRow label="Score"           value={String(score)} />
        <StatRow label="Bureau coverage" value={dim.bureauCoverageDisplay} muted />
        <StatRow label="Divergence"      value={divDisplay}                muted />
      </div>
      <EvidenceBar score={score} preferred={data.dimensionalScores.creditBehaviour_preferred_threshold ?? 65} />
      <ObsBullets bullets={data.narrative.creditObservations ?? []} />
      {isMixed && (
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed mt-2 border-t border-border pt-2">
          Bureau coverage applies to SA applicants only. Foreign national co-applicants are not assessed by SA bureaus.
        </p>
      )}
    </div>
  )
}

function VerificationBody({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>): JSX.Element {
  const dim = data.dimensions.verification
  return (
    <div>
      <p className="font-bold text-sm text-foreground leading-snug mb-2 min-h-[60px]">{data.narrative.verificationEvidenceLine}</p>
      <div className="border-t border-b border-border py-2 mb-2">
        <StatRow label="Score"             value={String(score)} />
        <StatRow label="Checks"            value={dim.checksPassedDisplay}          />
        <StatRow label="Overrides pending" value={String(dim.manualOverridesPending)} muted />
      </div>
      <EvidenceBar score={score} preferred={data.dimensionalScores.verificationIntegrity_preferred_threshold} />
      <ObsBullets bullets={data.narrative.verificationObservations} />
    </div>
  )
}

function DimCard({ label, docRef, children, noRight = false, noBottom = false, isThird = false }: Readonly<{
  label:     string
  docRef?:   string
  children:  React.ReactNode
  noRight?:  boolean
  noBottom?: boolean
  isThird?:  boolean
}>): JSX.Element {
  const widthCls   = isThird ? "w-1/3" : "w-1/2"
  const rightCls   = noRight  ? "border-r-0" : ""
  const bottomCls  = noBottom ? "border-b-0" : ""
  return (
    <div className={`${widthCls} p-3 border-r border-b border-border ${rightCls} ${bottomCls}`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
        {docRef !== undefined && (
          <a href={`#${toDocAnchorId(docRef)}`} className="font-mono text-[9px] text-muted-foreground/60 hover:text-foreground">§{docRef}</a>
        )}
      </div>
      {children}
    </div>
  )
}

interface DimensionCardEditorialProps {
  data: FitScoreReportData
}

export function DimensionCardEditorial({ data }: Readonly<DimensionCardEditorialProps>): JSX.Element {
  const affScore  = data.dimensionalScores.affordability
  const stabScore = data.dimensionalScores.stability
  const viScore   = data.dimensionalScores.verificationIntegrity

  // Three-dimension methodology: all-foreign and not LDP (eyebrow rendered by parent)
  if (data.isAllForeignNational && !data.isLdp) {
    return (
      <div className="flex border border-border bg-card mb-5">
        <DimCard label="01 Affordability" docRef="2" isThird noBottom>
          {affScore === null
            ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
            : <AffordabilityBody data={data} score={affScore} />
          }
        </DimCard>
        <DimCard label="02 Stability" isThird noBottom>
          {stabScore === null
            ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
            : <StabilityBody data={data} score={stabScore} />
          }
        </DimCard>
        <DimCard label="04 Verification" docRef="3.2" isThird noRight noBottom>
          {viScore === null
            ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
            : <VerificationBody data={data} score={viScore} />
          }
        </DimCard>
      </div>
    )
  }

  // Default: 2×2 four-dimension grid (all-SA, mixed, or LDP via null scores)
  return (
    <div className="flex flex-wrap border border-border bg-card mb-5">
      <DimCard label="01 Affordability" docRef="2">
        {affScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <AffordabilityBody data={data} score={affScore} />
        }
      </DimCard>
      <DimCard label="02 Stability" noRight>
        {stabScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <StabilityBody data={data} score={stabScore} />
        }
      </DimCard>
      <DimCard label="03 Credit behaviour" docRef="3.1" noBottom>
        <CreditBody data={data} />
      </DimCard>
      <DimCard label="04 Verification integrity" docRef="3.2" noRight noBottom>
        {viScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <VerificationBody data={data} score={viScore} />
        }
      </DimCard>
    </div>
  )
}
