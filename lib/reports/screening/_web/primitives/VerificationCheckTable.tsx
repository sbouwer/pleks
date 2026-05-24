/**
 * lib/reports/screening/_web/primitives/VerificationCheckTable.tsx — §3.2 verification check table
 *
 * Notes:  Web parity for _pdf/primitives/VerificationCheckTable.tsx.
 *         Outcome types: pass = consistent, partial = partial, absent = not solicited.
 */
import type { JSX } from "react"
import type { FitScoreReportData, VerificationCheckItem, VerificationOutcome } from "@/lib/reports/screening/_primitives/theme"
import { BlockHeader }     from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

function outcomeTagCls(t: VerificationOutcome): string {
  if (t === "pass")    return "text-blue-700 border-blue-300 bg-blue-50"
  if (t === "partial") return "text-amber-700 border-amber-400 bg-amber-50"
  return "text-muted-foreground border-border bg-muted/20"
}

function outcomeTagLabel(t: VerificationOutcome): string {
  if (t === "pass")    return "Consistent"
  if (t === "partial") return "Partial"
  return "Not solicited"
}

function CheckRow({ item, isLast }: Readonly<{ item: VerificationCheckItem; isLast: boolean }>): JSX.Element {
  return (
    <tr className={isLast ? "" : "border-b border-border"}>
      <td className="px-3 py-2.5">
        <div className="text-sm text-foreground">{item.checkName}</div>
        <div className="font-mono text-[9px] text-muted-foreground/60 mt-0.5">{item.checkSub}</div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-sm ${item.source === "—" ? "text-muted-foreground" : "text-foreground"}`}>{item.source}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-sm ${item.method === "—" ? "text-muted-foreground" : "text-foreground"}`}>{item.method}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1">
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border self-start ${outcomeTagCls(item.outcomeType)}`}>
            {outcomeTagLabel(item.outcomeType)}
          </span>
          {item.outcomeLabel !== "" && <span className="text-sm text-foreground">{item.outcomeLabel}</span>}
          {item.evidenceNote !== "" && <span className="font-mono text-[9px] text-muted-foreground/60 leading-snug">{item.evidenceNote}</span>}
        </div>
      </td>
    </tr>
  )
}

interface VerificationCheckTableProps {
  data: FitScoreReportData
}

export function VerificationCheckTable({ data }: Readonly<VerificationCheckTableProps>): JSX.Element {
  const ca = data.creditAnalysis
  const checksLabel = ca
    ? `${ca.verificationsLabel} · ${ca.verificationsQueryLabel}`
    : data.dimensions.verification.checksPassedDisplay

  return (
    <div className="border border-border bg-card mb-5">
      <BlockHeader
        label="3.2"
        title={`Primary checks · ${checksLabel}`}
        rightTag="queried via Pleks broker"
      />
      <div className="p-4">
        {ca === undefined ? (
          <PlaceholderCard
            variant="pending"
            message={
              "Detailed verification check outcomes pending expanded verification data. " +
              "Check counts are available on page 1 in the Verification Integrity dimension card."
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-border">
                {["Check", "Source", "Method", "Outcome"].map(h => (
                  <th key={h} className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left pb-2 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ca.verificationChecks.map((item, i) => (
                <CheckRow
                  key={`${i}-${item.checkName.slice(0, 12)}`}
                  item={item}
                  isLast={i === ca.verificationChecks.length - 1}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
