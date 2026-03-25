import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"

interface DeductionItem {
  room: string | null
  item_description: string
  classification: string
  deduction_amount_cents: number
  ai_justification: string | null
  quote_amount_cents: number | null
}

interface ScheduleData {
  property_address: string
  landlord_name: string
  org_name: string
  tenant_name: string
  lease_start: Date
  lease_end: Date
  vacated_date: Date
  deposit_held_cents: number
  interest_accrued_cents: number
  total_available_cents: number
  total_deductions_cents: number
  refund_to_tenant_cents: number
  return_days: number
  deadline: Date
  items: DeductionItem[]
}

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; }
  h1 { font-size: 14px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 10px; color: #666; margin-bottom: 16px; }
  .section { margin-bottom: 16px; }
  .section-title { font-size: 11px; font-weight: 700; border-bottom: 2px solid #1a1a1a; padding-bottom: 4px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; vertical-align: top; }
  .text-right { text-align: right; }
  .summary-row { font-weight: 700; border-top: 2px solid #1a1a1a; }
  .justification { font-size: 9px; color: #475569; font-style: italic; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; }
  .info-grid dt { color: #64748b; }
  .info-grid dd { font-weight: 600; }
  .footer { margin-top: 24px; font-size: 9px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .sign-line { margin-top: 24px; display: flex; gap: 40px; }
  .sign-line div { border-top: 1px solid #1a1a1a; padding-top: 4px; width: 200px; font-size: 9px; color: #64748b; }
`

export function buildDeductionScheduleHTML(data: ScheduleData): string {
  const wearAndTearItems = data.items.filter((i) => i.classification !== "tenant_damage")
  const damageItems = data.items.filter((i) => i.classification === "tenant_damage")

  let itemNum = 0

  const wearAndTearRows = wearAndTearItems.map((item) => {
    itemNum++
    return `<tr>
      <td>${itemNum}.</td>
      <td>${item.room ?? ""}</td>
      <td>
        ${item.item_description}
        <div class="justification">${item.ai_justification ?? ""}</div>
      </td>
      <td style="text-transform: capitalize">${item.classification.replace(/_/g, " ")}</td>
      <td class="text-right">R 0.00</td>
    </tr>`
  }).join("")

  const damageRows = damageItems.map((item) => {
    itemNum++
    return `<tr>
      <td>${itemNum}.</td>
      <td>${item.room ?? ""}</td>
      <td>
        ${item.item_description}
        <div class="justification">${item.ai_justification ?? ""}</div>
        ${item.quote_amount_cents ? `<div class="justification">Quote: ${formatZAR(item.quote_amount_cents, true)}</div>` : ""}
      </td>
      <td>Tenant Damage</td>
      <td class="text-right">${formatZAR(item.deduction_amount_cents, true)}</td>
    </tr>`
  }).join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <h1>ITEMISED DEDUCTION SCHEDULE</h1>
    <p class="subtitle">In terms of the Rental Housing Act 50 of 1999, Section 5(3)(g)</p>

    <div class="section">
      <dl class="info-grid">
        <dt>Property:</dt><dd>${data.property_address}</dd>
        <dt>Landlord:</dt><dd>${data.landlord_name} (managed by ${data.org_name})</dd>
        <dt>Tenant:</dt><dd>${data.tenant_name}</dd>
        <dt>Lease:</dt><dd>${formatDateShort(data.lease_start)} – ${formatDateShort(data.lease_end)}</dd>
        <dt>Vacated:</dt><dd>${formatDateShort(data.vacated_date)}</dd>
      </dl>
    </div>

    <div class="section">
      <div class="section-title">DEPOSIT HELD IN TRUST</div>
      <table>
        <tr><td>Original deposit received:</td><td class="text-right">${formatZAR(data.deposit_held_cents, true)}</td></tr>
        <tr><td>Interest accrued:</td><td class="text-right">${formatZAR(data.interest_accrued_cents, true)}</td></tr>
        <tr class="summary-row"><td>Total available:</td><td class="text-right">${formatZAR(data.total_available_cents, true)}</td></tr>
      </table>
    </div>

    ${wearAndTearItems.length > 0 ? `
    <div class="section">
      <div class="section-title">ITEMS ASSESSED — WEAR &amp; TEAR (NOT deducted per RHA s5)</div>
      <table>
        <tr><th>#</th><th>Room</th><th>Description</th><th>Classification</th><th class="text-right">Deduction</th></tr>
        ${wearAndTearRows}
      </table>
    </div>` : ""}

    ${damageItems.length > 0 ? `
    <div class="section">
      <div class="section-title">ITEMS ASSESSED — TENANT DAMAGE (deductible)</div>
      <table>
        <tr><th>#</th><th>Room</th><th>Description</th><th>Classification</th><th class="text-right">Deduction</th></tr>
        ${damageRows}
      </table>
    </div>` : ""}

    <div class="section">
      <div class="section-title">DEPOSIT RETURN CALCULATION</div>
      <table>
        <tr><td>Total available (deposit + interest):</td><td class="text-right">${formatZAR(data.total_available_cents, true)}</td></tr>
        <tr><td>Less: Total deductions:</td><td class="text-right">${formatZAR(data.total_deductions_cents, true)}</td></tr>
        <tr class="summary-row"><td>REFUND TO TENANT:</td><td class="text-right">${formatZAR(data.refund_to_tenant_cents, true)}</td></tr>
      </table>
      <p style="font-size: 10px; margin-top: 8px;">
        Refund within ${data.return_days} days of vacation date (by ${formatDateShort(data.deadline)}).
      </p>
    </div>

    <div class="sign-line">
      <div>Signed: ________________________</div>
      <div>Date: ___________</div>
    </div>

    <div class="footer">
      <p>You have the right to dispute these deductions by contacting the Rental Housing Tribunal in your province.</p>
      <p style="margin-top: 4px;">Generated by Pleks — ${formatDateShort(new Date())}</p>
    </div>
  </body></html>`
}
