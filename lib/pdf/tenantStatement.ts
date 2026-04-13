import { formatZAR } from "@/lib/constants"

interface StatementEntry {
  date: string
  description: string
  debitCents: number
  creditCents: number
  ref: string | null
}

interface StatementData {
  tenant_name: string
  property_name: string
  unit_number: string
  period_from: string
  period_to: string
  entries: StatementEntry[]
  current_balance_cents: number
  deposit_held_cents: number
  org_name: string
  org_logo_url?: string | null
  org_address?: string | null
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
  header img { height: 40px; }
  header .org-info h2 { font-size: 16px; margin-bottom: 2px; }
  header .org-info p { font-size: 10px; color: #666; }
  hr { border: none; border-top: 2px solid #0f172a; margin: 8px 0 16px; }
  h1 { font-size: 14px; text-align: center; margin-bottom: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 16px; font-size: 10px; }
  .info-grid dt { color: #64748b; }
  .info-grid dd { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
  .text-right { text-align: right; }
  .text-green { color: #16a34a; }
  .text-red { color: #dc2626; }
  .totals-row td { border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; font-weight: 700; padding: 6px 8px; }
  .summary { margin-top: 12px; font-size: 11px; }
  .summary .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .summary .balance { font-weight: 700; font-size: 12px; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 4px; }
  .footnote { margin-top: 24px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
`

export function buildTenantStatementHTML(data: StatementData): string {
  let totalDebit = 0
  let totalCredit = 0
  let runningBalance = 0

  const rows = data.entries.map((e) => {
    totalDebit += e.debitCents
    totalCredit += e.creditCents
    runningBalance = runningBalance + e.debitCents - e.creditCents
    const balClass = runningBalance > 0 ? "text-red" : "text-green"
    const balPrefix = runningBalance < 0 ? "CR " : ""
    const balStr = runningBalance === 0 ? "—" : `${balPrefix}${formatZAR(Math.abs(runningBalance))}`
    return `<tr>
      <td>${e.date}</td>
      <td>${e.description}${e.ref ? `<br><span style="font-size:9px;color:#94a3b8">${e.ref}</span>` : ""}</td>
      <td class="text-right">${e.debitCents > 0 ? formatZAR(e.debitCents) : "—"}</td>
      <td class="text-right text-green">${e.creditCents > 0 ? formatZAR(e.creditCents) : "—"}</td>
      <td class="text-right ${balClass}">${balStr}</td>
    </tr>`
  }).join("")

  const finalBalClass = data.current_balance_cents > 0 ? "text-red" : "text-green"
  const finalBalLabel = data.current_balance_cents > 0 ? "Amount owing" : "Credit balance"
  const finalBalStr = `${data.current_balance_cents < 0 ? "CR " : ""}${formatZAR(Math.abs(data.current_balance_cents))}`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <header>
      ${data.org_logo_url ? `<img src="${data.org_logo_url}" alt="${data.org_name}">` : ""}
      <div class="org-info">
        <h2>${data.org_name}</h2>
        ${data.org_address ? `<p>${data.org_address}</p>` : ""}
      </div>
    </header>
    <hr>
    <h1>TENANT STATEMENT</h1>
    <dl class="info-grid">
      <dt>Tenant</dt><dd>${data.tenant_name}</dd>
      <dt>Period</dt><dd>${data.period_from} — ${data.period_to}</dd>
      <dt>Property</dt><dd>${data.property_name}</dd>
      <dt>Generated</dt><dd>${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</dd>
      <dt>Unit</dt><dd>${data.unit_number}</dd>
    </dl>
    <table>
      <thead><tr>
        <th>Date</th><th>Description</th>
        <th class="text-right">Debit</th><th class="text-right">Credit</th><th class="text-right">Balance</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="2">Totals</td>
          <td class="text-right">${formatZAR(totalDebit)}</td>
          <td class="text-right text-green">${formatZAR(totalCredit)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="summary">
      <div class="row"><span>${finalBalLabel}:</span><span class="${finalBalClass}" style="font-weight:700">${finalBalStr}</span></div>
      <div class="row"><span>Deposit held:</span><span style="font-weight:700">${formatZAR(data.deposit_held_cents)}</span></div>
    </div>
    <div class="footnote">This statement is system-generated and does not require a signature.</div>
  </body></html>`
}
