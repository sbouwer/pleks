"use client"

/**
 * app/(public)/WorkTabsClient.tsx — interactive tab frame for "The work" section
 *
 * Notes: Extracted from page.tsx (Server Component) so the tab bar can have
 *        client-side state. Date strings are pre-computed server-side and passed
 *        as props to keep this section's rendering deterministic.
 */

import { useState } from "react"

interface WorkTabsClientProps {
  stmtMonLong: string
  stmtYear: number
  stmtMM: string
  stmtSlug: string
  lastDayLabel: string
  todayLabel: string
  auditLabel: string
  nowYear: number
}

export function WorkTabsClient({
  stmtMonLong, stmtYear, stmtMM, stmtSlug,
  lastDayLabel, todayLabel, auditLabel, nowYear,
}: WorkTabsClientProps) {
  const [tab, setTab] = useState(0)

  return (
    <div className="pub-artefact-frame" style={{ position: "relative", zIndex: 1 }}>
      <div className="pub-artefact-tabs" role="tablist">
        <button className="pub-artefact-tab" type="button" aria-selected={tab === 0} role="tab" onClick={() => setTab(0)}>
          <span className="dot" />Landlord statement
        </button>
        <button className="pub-artefact-tab" type="button" aria-selected={tab === 1} role="tab" onClick={() => setTab(1)}>
          <span className="dot" />Applicant FitScore
        </button>
        <button className="pub-artefact-tab" type="button" aria-selected={tab === 2} role="tab" onClick={() => setTab(2)}>
          <span className="dot" />Applicant fee receipt
        </button>
      </div>

      {tab === 0 && (
        <div style={{ padding: 36, overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 36, paddingBottom: 28, borderBottom: "1px solid var(--rule-strong)", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-mute)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>{`Landlord statement · ${stmtMonLong} ${stmtYear}`}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 28, letterSpacing: "-0.02em", fontWeight: 500 }}>Mrs. A. van Zyl</h3>
              <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>17 Loop Street, Bo-Kaap, Cape Town, 8001 · Unit A (2B/1B) · Tenant: N. Dlamini</div>
              <div style={{ fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>{`ref · STMT-${stmtSlug}-A0417 · rent_roll R 13,500.00`}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: "var(--ink-mute)" }}>
              <strong style={{ color: "var(--ink)", fontWeight: 500, display: "block" }}>Rox &amp; Co Property Management</strong>
              {`PPRA FFC ${nowYear} · 2025-0041`}<br/>
              Trust acc · ABSA 407 889 1204<br/>
              {`Statement issued · ${todayLabel}`}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: "1px solid var(--rule-strong)" }}>
            {([
              { lbl: "Opening balance",      val: "R 0.00",      amber: false },
              { lbl: "Receipts",             val: "R 13,500.00", amber: false },
              { lbl: "Fees & disbursements", val: "−R 1,687.50", amber: false },
              { lbl: "Payable to you",       val: "R 11,812.50", amber: true  },
            ] as const).map(cell => (
              <div key={cell.lbl} style={{ padding: "20px 24px", borderRight: "1px solid var(--rule)", background: cell.amber ? "var(--amber-wash)" : undefined }}>
                <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-mute)", marginBottom: 8 }}>{cell.lbl}</div>
                <div style={{ fontSize: 22, fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{cell.val}</div>
              </div>
            ))}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 13 }}>
            <thead>
              <tr>
                {(["Date","Description","Reference","Debit","Credit","Balance"] as const).map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: "var(--ink-mute)", padding: "0 12px 12px", borderBottom: "1px solid var(--rule-strong)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { date: `01 ${stmtMonLong.slice(0,3)}`, desc: "Opening balance",                   ref: "—",                              debit: "—",        credit: "—",         bal: "0.00",       tag: null,    closing: false },
                { date: `02 ${stmtMonLong.slice(0,3)}`, desc: "Rent received — debit order",        ref: `DO-M2431-${stmtMM}`,             debit: "—",        credit: "13,500.00", bal: "13,500.00",  tag: "rent",  closing: false },
                { date: `02 ${stmtMonLong.slice(0,3)}`, desc: "Management fee (10%)",               ref: `FEE-0417-${stmtMM}`,             debit: "1,350.00", credit: "—",         bal: "12,150.00",  tag: "fee",   closing: false },
                { date: `14 ${stmtMonLong.slice(0,3)}`, desc: "Geyser element — plumber invoice",   ref: "MX-8821",                        debit: "287.50",   credit: "—",         bal: "11,862.50",  tag: "maint", closing: false },
                { date: `14 ${stmtMonLong.slice(0,3)}`, desc: "VAT on fee",                         ref: `VAT-0417-${stmtMM}`,             debit: "50.00",    credit: "—",         bal: "11,812.50",  tag: "vat",   closing: false },
                { date: lastDayLabel,                    desc: "Payable to landlord — pending EFT",  ref: `PAY-0417-${stmtMM}`,             debit: "—",        credit: "—",         bal: "11,812.50",  tag: null,    closing: true  },
              ]).map((row) => (
                <tr key={row.ref} style={{ background: row.closing ? "var(--paper-sunk)" : undefined }}>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)" }}>{row.date}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontWeight: row.closing ? 600 : undefined }}>
                    {row.desc}
                    {row.tag && <span style={{ display: "inline-block", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, background: "var(--paper-sunk)", border: "1px solid var(--rule)", color: "var(--ink-mute)", marginLeft: 8, fontFamily: "var(--pub-mono)" }}>{row.tag}</span>}
                  </td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--pub-mono)", fontSize: 12, color: "var(--ink-mute)" }}>{row.ref}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{row.debit}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums" }}>{row.credit}</td>
                  <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--rule)", textAlign: "right", fontFamily: "var(--pub-mono)", fontVariantNumeric: "tabular-nums", fontWeight: row.closing ? 600 : undefined }}>{row.bal}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, paddingTop: 24, marginTop: 12, borderTop: "1px solid var(--rule)", fontSize: 11.5, color: "var(--ink-mute)", fontFamily: "var(--pub-mono)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--positive)" }}>●</span>{" "}
              {`Trust reconciled ${lastDayLabel} 23:59 · ΔR0.00`}
            </div>
            <div>doc_hash · 0x 9b7c 2e01 4a3f · signed by Pleks</div>
            <div>{`audit entries #4780–#4811 · exportable · ${auditLabel}`}</div>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div style={{ padding: "64px 36px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--pub-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--amber-ink)", marginBottom: 12 }}>FitScore · Applicant report</div>
          <p style={{ color: "var(--ink-mute)", fontSize: 14, maxWidth: "40ch", margin: "0 auto" }}>
            The FitScore preview will be shown here — a single 0–100 decision number with affordability, credit history, and ID integrity components broken out.
          </p>
        </div>
      )}

      {tab === 2 && (
        <div style={{ padding: "64px 36px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--pub-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--amber-ink)", marginBottom: 12 }}>Fee receipt · Applicant copy</div>
          <p style={{ color: "var(--ink-mute)", fontSize: 14, maxWidth: "40ch", margin: "0 auto" }}>
            The applicant fee receipt — issued when they pay for their own credit check, with the POPIA consent reference attached.
          </p>
        </div>
      )}
    </div>
  )
}
