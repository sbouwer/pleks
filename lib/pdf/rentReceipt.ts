import { formatZAR } from "@/lib/constants"

interface ReceiptData {
  receipt_number: string
  payment_date: string
  tenant_name: string
  property_name: string
  unit_number: string
  lease_ref: string
  amount_cents: number
  payment_method: string
  reference: string | null
  applied_lines: { label: string; amount_cents: number }[]
  balance_after_cents: number
  org_name: string
  org_logo_url?: string | null
  org_address?: string | null
  org_phone?: string | null
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
  header img { height: 40px; }
  header .org-info h2 { font-size: 16px; margin-bottom: 2px; }
  header .org-info p { font-size: 10px; color: #666; }
  hr { border: none; border-top: 2px solid #0f172a; margin: 8px 0 20px; }
  h1 { font-size: 14px; text-align: center; letter-spacing: 0.05em; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 160px 1fr; gap: 5px 16px; font-size: 10px; margin-bottom: 16px; }
  .info-grid dt { color: #64748b; }
  .info-grid dd { font-weight: 600; }
  .amount-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
  .amount-box .label { font-size: 9px; text-transform: uppercase; color: #64748b; }
  .amount-box .value { font-size: 22px; font-weight: 700; margin-top: 2px; color: #16a34a; }
  .applied-section { margin-bottom: 16px; }
  .applied-section .title { font-size: 10px; font-weight: 700; margin-bottom: 6px; }
  .applied-row { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; border-bottom: 1px solid #f1f5f9; }
  .balance-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; margin-top: 6px; }
  hr2 { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  .footer-block { margin-top: 24px; font-size: 9px; color: #64748b; }
  .footer-block p { margin-bottom: 2px; }
  .footnote { margin-top: 16px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; }
`

export function buildRentReceiptHTML(data: ReceiptData): string {
  const appliedRows = data.applied_lines.map((l) =>
    `<div class="applied-row"><span>${l.label}</span><span>${formatZAR(l.amount_cents)}</span></div>`
  ).join("")

  const balColor = data.balance_after_cents > 0 ? "#dc2626" : "#16a34a"
  const balPrefix = data.balance_after_cents > 0 ? "" : "CR "
  const logoHtml = data.org_logo_url ? `<img src="${data.org_logo_url}" alt="${data.org_name}">` : ""
  const phoneFragment = data.org_phone ? ` | ${data.org_phone}` : ""
  const addressHtml = data.org_address ? `<p>${data.org_address}${phoneFragment}</p>` : ""

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <header>
      ${logoHtml}
      <div class="org-info">
        <h2>${data.org_name}</h2>
        ${addressHtml}
      </div>
    </header>
    <hr>
    <h1>RECEIPT OF PAYMENT</h1>
    <dl class="info-grid">
      <dt>Receipt No</dt><dd>${data.receipt_number}</dd>
      <dt>Date</dt><dd>${data.payment_date}</dd>
      <dt>Received from</dt><dd>${data.tenant_name}</dd>
      <dt>Property</dt><dd>${data.property_name}, ${data.unit_number}</dd>
      <dt>Lease ref</dt><dd>${data.lease_ref}</dd>
      <dt>Payment method</dt><dd>${data.payment_method.replaceAll("_", " ")}</dd>
      ${data.reference ? `<dt>Reference</dt><dd>${data.reference}</dd>` : ""}
    </dl>
    <div class="amount-box">
      <div class="label">Amount received</div>
      <div class="value">${formatZAR(data.amount_cents)}</div>
    </div>
    ${data.applied_lines.length > 0 ? `
    <div class="applied-section">
      <div class="title">Applied to:</div>
      ${appliedRows}
      <div class="balance-row">
        <span>Balance after payment:</span>
        <span style="color:${balColor}">${balPrefix}${formatZAR(Math.abs(data.balance_after_cents))}</span>
      </div>
    </div>` : ""}
    <div class="footer-block">
      <p>${data.org_name}</p>
      ${data.org_address ? `<p>${data.org_address}</p>` : ""}
      <p>${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</p>
    </div>
    <div class="footnote">This receipt is system-generated and serves as proof of payment under the Rental Housing Act.</div>
  </body></html>`
}
