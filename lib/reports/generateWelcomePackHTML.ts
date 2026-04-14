import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "./periods"
import { FONT_STACKS, getFontLink, type ReportBranding } from "./reportBranding"
import { letterhead } from "./generatePDF"
import type { WelcomePackData, WelcomePackUnit } from "./types"
import type { Recommendation } from "./welcomePackRecommendations"

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatDateLocal(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function occupancyPct(occupied: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((occupied / total) * 100)}%`
}

function priorityBadge(priority: string, accent: string): string {
  const colours: Record<string, string> = {
    high:   "#dc2626",
    medium: "#d97706",
    low:    "#16a34a",
  }
  const colour = colours[priority] ?? accent
  return `<span style="display:inline-block;background:${colour};color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:3px;margin-right:6px;">${priority}</span>`
}

function flagBadge(flag: string): string {
  const labels: Record<string, string> = {
    expiring_soon: "⚠ Expiring soon",
    month_to_month: "↻ Month-to-month",
    on_notice:      "📋 On notice",
    expired:        "⚠ Lease expired",
  }
  return labels[flag] ? `<span style="font-size:9px;color:#d97706;">${labels[flag]}</span>` : ""
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function getWelcomeCSS(org: ReportBranding): string {
  const fontStack = FONT_STACKS[org.font] ?? FONT_STACKS.inter
  const accent = org.accent_color
  const accentLight = `${accent}1a`
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontStack}; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; }
  header { margin-bottom: 12px; }
  hr.accent { border: none; border-top: 2px solid ${accent}; margin: 8px 0 16px; }
  h1 { font-size: 14px; margin-bottom: 2px; }
  h2 { font-size: 12px; margin: 20px 0 8px; color: ${accent}; }
  h3 { font-size: 11px; margin: 12px 0 4px; color: #1a1a1a; }
  .subtitle { font-size: 10px; color: #64748b; margin-bottom: 16px; }
  .page-break { page-break-before: always; padding-top: 4mm; }
  .section-rule { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; background: ${accentLight}; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; vertical-align: top; }
  tr:last-child td { border-bottom: 2px solid #e2e8f0; }
  .text-right { text-align: right; }
  .text-muted { color: #64748b; }
  .text-danger { color: #dc2626; }
  .text-success { color: #16a34a; }
  .text-warning { color: #d97706; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .metric { background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid ${accent}; border-radius: 6px; padding: 10px; }
  .metric .label { font-size: 9px; color: #64748b; text-transform: uppercase; }
  .metric .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .metric .sub { font-size: 9px; color: #94a3b8; }
  .tenant-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
  .tenant-card .tc-name { font-size: 11px; font-weight: 600; }
  .tenant-card .tc-meta { font-size: 9px; color: #64748b; margin-top: 3px; line-height: 1.6; }
  .tenant-card .tc-flag { margin-top: 4px; }
  .proj-table td { font-size: 9.5px; }
  .proj-table .esc-row td { background: ${accentLight}; }
  .rec-item { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
  .rec-item:last-child { border-bottom: none; }
  .rec-item .rec-title { font-size: 11px; font-weight: 600; margin-bottom: 3px; }
  .rec-item .rec-body { font-size: 10px; color: #374151; line-height: 1.5; }
  .rec-item .rec-impact { font-size: 9px; color: #16a34a; margin-top: 3px; }
  .footer { margin-top: 24px; font-size: 8px; color: #94a3b8; text-align: center; }
  `
}

// ── Page 1: Portfolio Snapshot ────────────────────────────────────────────────

function buildPage1(data: WelcomePackData, org: ReportBranding): string {
  const { totals, properties } = data
  const accent = org.accent_color

  const propRows = properties.map((p) => `
    <tr>
      <td>${p.name}</td>
      <td style="text-transform:capitalize;">${p.type.replace("_", " ")}</td>
      <td class="text-right">${p.total_units}</td>
      <td class="text-right">${p.occupied_units} (${occupancyPct(p.occupied_units, p.total_units)})</td>
      <td class="text-right">${formatZAR(p.monthly_income_cents)}</td>
    </tr>
  `).join("")

  return `
    <div class="metric-grid">
      <div class="metric">
        <div class="label">Properties</div>
        <div class="value">${totals.properties}</div>
      </div>
      <div class="metric">
        <div class="label">Total Units</div>
        <div class="value">${totals.units}</div>
      </div>
      <div class="metric">
        <div class="label">Occupied</div>
        <div class="value">${totals.occupied} <span class="sub">(${occupancyPct(totals.occupied, totals.units)})</span></div>
      </div>
      <div class="metric">
        <div class="label">Vacant</div>
        <div class="value${totals.vacant > 0 ? " text-warning" : ""}">${totals.vacant}</div>
      </div>
    </div>
    <div class="metric-grid">
      <div class="metric">
        <div class="label">Monthly Income</div>
        <div class="value" style="font-size:13px;">${formatZAR(totals.monthly_income_cents)}</div>
      </div>
      <div class="metric">
        <div class="label">Annual Projection</div>
        <div class="value" style="font-size:13px;">${formatZAR(totals.annual_projected_income_cents)}</div>
      </div>
      <div class="metric">
        <div class="label">Deposits Held</div>
        <div class="value" style="font-size:13px;">${formatZAR(totals.deposits_held_cents)}</div>
      </div>
      <div class="metric">
        <div class="label">Vacancy Loss/mo</div>
        <div class="value${totals.vacancy_cost_cents > 0 ? " text-danger" : ""}" style="font-size:13px;">${totals.vacancy_cost_cents > 0 ? `–${formatZAR(totals.vacancy_cost_cents)}` : "—"}</div>
      </div>
    </div>
    <h2 style="color:${accent};">Properties</h2>
    <table>
      <tr>
        <th>Property</th><th>Type</th>
        <th class="text-right">Units</th>
        <th class="text-right">Occupied</th>
        <th class="text-right">Monthly Income</th>
      </tr>
      ${propRows}
    </table>
  `
}

// ── Page 2: Rental Income Analysis ───────────────────────────────────────────

function buildPage2(data: WelcomePackData): string {
  const allUnits = data.properties.flatMap((p) =>
    p.units.map((u) => ({ ...u, property_name: p.name })),
  )

  const rows = allUnits.map((u) => {
    let tenantCell = `<span class="text-muted">— VACANT —</span>`
    if (u.tenant_name) {
      const coSuffix = u.co_tenants.length > 0 ? ` <span class="text-muted">&amp; ${u.co_tenants.join(", ")}</span>` : ""
      tenantCell = u.tenant_name + coSuffix
    }
    const rentCell = u.rent_cents > 0 ? formatZAR(u.rent_cents) : "—"
    const m2Cell = u.rent_per_m2_cents ? `${formatZAR(u.rent_per_m2_cents)}/m²` : "—"
    return `
      <tr>
        <td>${u.property_name} ${u.unit_number}</td>
        <td>${tenantCell}</td>
        <td class="text-right">${rentCell}</td>
        <td class="text-right">${m2Cell}</td>
        <td class="text-muted" style="font-size:9px;">Market data pending</td>
      </tr>
    `
  }).join("")

  const totalRent = formatZAR(data.totals.monthly_income_cents)
  const potentialRent = data.totals.vacancy_cost_cents > 0
    ? ` | If fully occupied: est. ${formatZAR(data.totals.monthly_income_cents + data.totals.vacancy_cost_cents)}/month`
    : ""

  return `
    <div class="page-break">
      <h2>Rental Income Analysis</h2>
      <table>
        <tr>
          <th>Unit</th><th>Tenant</th>
          <th class="text-right">Rent/month</th>
          <th class="text-right">R/m²</th>
          <th>Market estimate</th>
        </tr>
        ${rows}
      </table>
      <p class="text-muted" style="font-size:9px;">
        Current total: <strong>${totalRent}/month</strong>${potentialRent}<br>
        Market estimates require Searchworx/Lightstone integration — available at Stage 2 credit check.
      </p>
    </div>
  `
}

// ── Page 3: 12-Month Projection ───────────────────────────────────────────────

interface MonthProjection {
  label: string
  gross: number
  expenses: number
  mgmt: number
  net: number
  escalationNote: string
}

function buildProjection(data: WelcomePackData): MonthProjection[] {
  const MGMT_RATE = 0.092        // 8% + 15% VAT
  const EXPENSE_RATE_RESI = 0.05
  const EXPENSE_RATE_COMM = 0.03

  // Build a rent map per unit, starting from current rent
  const rentMap = new Map<string, number>()
  const allUnitsFlat = data.properties.flatMap((p) =>
    p.units.map((u) => ({ ...u, property_type: p.type })),
  )

  for (const u of allUnitsFlat) {
    if (u.rent_cents > 0) rentMap.set(u.unit_id, u.rent_cents)
  }

  const months: MonthProjection[] = []
  const now = new Date()

  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const monthLabel = monthDate.toLocaleDateString("en-ZA", { month: "short", year: "numeric" })
    const notes: string[] = []

    // Apply escalations that fall in this month
    for (const u of allUnitsFlat) {
      if (!u.escalation_date || u.escalation_percent <= 0) continue
      const escDate = new Date(`${u.escalation_date}T00:00:00`)
      if (
        escDate.getFullYear() === monthDate.getFullYear() &&
        escDate.getMonth() === monthDate.getMonth()
      ) {
        const current = rentMap.get(u.unit_id) ?? u.rent_cents
        const updated = Math.round(current * (1 + u.escalation_percent / 100))
        rentMap.set(u.unit_id, updated)
        notes.push(`${u.tenant_name ?? u.unit_id} +${u.escalation_percent}%`)
      }
    }

    const gross = Array.from(rentMap.values()).reduce((s, v) => s + v, 0)

    // Weighted expense rate (residential vs commercial)
    const residIncome = allUnitsFlat
      .filter((u) => u.property_type !== "commercial" && rentMap.has(u.unit_id))
      .reduce((s, u) => s + (rentMap.get(u.unit_id) ?? 0), 0)
    const commIncome = gross - residIncome
    const expenses = Math.round(residIncome * EXPENSE_RATE_RESI + commIncome * EXPENSE_RATE_COMM)
    const mgmt = Math.round(gross * MGMT_RATE)
    const net = gross - expenses - mgmt

    months.push({ label: monthLabel, gross, expenses, mgmt, net, escalationNote: notes.join("; ") })
  }

  return months
}

function buildPage3(data: WelcomePackData): string {
  const projection = buildProjection(data)

  const rows = projection.map((m) => {
    const hasEsc = m.escalationNote.length > 0
    const cls = hasEsc ? ' class="esc-row"' : ""
    const note = hasEsc ? ` <span style="font-size:8px;color:#1e3a5f;">↑ ${m.escalationNote}</span>` : ""
    return `
      <tr${cls}>
        <td>${m.label}${note}</td>
        <td class="text-right">${formatZAR(m.gross)}</td>
        <td class="text-right text-muted">${formatZAR(m.expenses)}</td>
        <td class="text-right text-muted">${formatZAR(m.mgmt)}</td>
        <td class="text-right"><strong>${formatZAR(m.net)}</strong></td>
      </tr>
    `
  }).join("")

  const totalGross   = projection.reduce((s, m) => s + m.gross, 0)
  const totalExpense = projection.reduce((s, m) => s + m.expenses, 0)
  const totalMgmt    = projection.reduce((s, m) => s + m.mgmt, 0)
  const totalNet     = projection.reduce((s, m) => s + m.net, 0)

  return `
    <div class="page-break">
      <h2>12-Month Financial Projection</h2>
      <table class="proj-table">
        <tr>
          <th>Month</th>
          <th class="text-right">Gross Income</th>
          <th class="text-right">Est. Expenses</th>
          <th class="text-right">Mgmt Fee (8%+V)</th>
          <th class="text-right">Net to Owner</th>
        </tr>
        ${rows}
        <tr style="font-weight:700;background:#f1f5f9;">
          <td>12-Month Total</td>
          <td class="text-right">${formatZAR(totalGross)}</td>
          <td class="text-right">${formatZAR(totalExpense)}</td>
          <td class="text-right">${formatZAR(totalMgmt)}</td>
          <td class="text-right">${formatZAR(totalNet)}</td>
        </tr>
      </table>
      <p class="text-muted" style="font-size:9px;">
        Projection assumes current occupancy maintained. Expenses estimated at 5% of gross (residential) and 3% (commercial) — SA industry average for well-maintained properties. Highlighted rows indicate scheduled escalations. This is a projection based on assumptions — actual results may vary.
      </p>
    </div>
  `
}

// ── Page 4: Tenant Profiles ───────────────────────────────────────────────────

function buildTenantCard(u: WelcomePackUnit & { property_name: string }): string {
  if (!u.tenant_name) return ""

  const names = [u.tenant_name, ...u.co_tenants].join(" &amp; ")
  let leaseRange = "Dates not set"
  if (u.lease_start && u.lease_end) {
    leaseRange = `${formatDateLocal(u.lease_start)} – ${formatDateLocal(u.lease_end)}`
  } else if (u.lease_start) {
    leaseRange = `From ${formatDateLocal(u.lease_start)}`
  }

  let daysNote = ""
  if (u.days_remaining !== null) {
    if (u.days_remaining < 0) {
      daysNote = `<span class="text-danger">(EXPIRED ${Math.abs(u.days_remaining)} days ago)</span>`
    } else {
      daysNote = `<span class="text-muted">(${u.days_remaining} days remaining)</span>`
    }
  }

  const depositOk = u.deposit_months >= 2
  const depositNote = `${formatZAR(u.deposit_cents)} (${u.deposit_months}× rent ${depositOk ? "✓" : "⚠ check deposit level"})`

  const flagsHtml = u.flags
    .filter((f) => f !== "vacant")
    .map((f) => flagBadge(f))
    .join(" ")

  return `
    <div class="tenant-card">
      <div class="tc-name">${names} — ${u.property_name} Unit ${u.unit_number}</div>
      <div class="tc-meta">
        Lease: ${leaseRange} ${daysNote}<br>
        Rent: ${formatZAR(u.rent_cents)}/month &nbsp;|&nbsp; Deposit: ${depositNote}<br>
        Payment: ${u.payment_method}
        ${u.escalation_date ? `<br>Escalation: ${u.escalation_percent}% on ${formatDateLocal(u.escalation_date)} → ${formatZAR(u.next_rent_cents)}/month` : ""}
      </div>
      ${flagsHtml ? `<div class="tc-flag">${flagsHtml}</div>` : ""}
    </div>
  `
}

function buildPage4(data: WelcomePackData): string {
  const allUnitsWithProp = data.properties.flatMap((p) =>
    p.units.map((u) => ({ ...u, property_name: p.name })),
  )
  const occupied = allUnitsWithProp.filter((u) => !!u.tenant_name)
  const vacant   = allUnitsWithProp.filter((u) => !u.tenant_name)

  const tenantCards = occupied.map((u) => buildTenantCard(u)).join("")

  const vacantRows = vacant.length > 0
    ? `<h3 style="margin-top:16px;">Vacant Units</h3>
       <table>
         <tr><th>Property</th><th>Unit</th><th>Est. Market Rent</th></tr>
         ${vacant.map((u) => `<tr><td>${u.property_name}</td><td>${u.unit_number}</td><td class="text-muted" style="font-size:9px;">Market data pending</td></tr>`).join("")}
       </table>`
    : ""

  return `
    <div class="page-break">
      <h2>Tenant Profiles &amp; Risk Overview</h2>
      ${tenantCards || "<p class='text-muted'>No active tenants.</p>"}
      ${vacantRows}
    </div>
  `
}

// ── Page 5: Compliance Calendar ───────────────────────────────────────────────

function buildPage5(data: WelcomePackData): string {
  const { cpa_notices, escalations } = data.compliance

  const cpaSection = cpa_notices.length > 0
    ? `<h3>CPA Section 14 Notices Due</h3>
       <table>
         <tr><th>Tenant</th><th>Unit</th><th>Property</th><th>Lease End</th><th>Notice Due By</th><th class="text-right">Days Remaining</th></tr>
         ${cpa_notices.map((n) => `
           <tr>
             <td>${n.tenant_name}</td>
             <td>${n.unit}</td>
             <td>${n.property}</td>
             <td>${formatDateLocal(n.lease_end)}</td>
             <td class="text-warning">${formatDateLocal(n.notice_due_by)}</td>
             <td class="text-right">${n.days_remaining}</td>
           </tr>
         `).join("")}
       </table>`
    : `<p class="text-muted" style="font-size:10px;margin-bottom:12px;">No CPA notices due in the next 80 days.</p>`

  const escSection = escalations.length > 0
    ? `<h3>Scheduled Escalations — Next 12 Months</h3>
       <table>
         <tr><th>Tenant</th><th>Unit</th><th>Property</th><th>Date</th><th class="text-right">Current Rent</th><th class="text-right">New Rent</th><th class="text-right">Increase</th></tr>
         ${escalations.map((e) => `
           <tr>
             <td>${e.tenant_name}</td>
             <td>${e.unit}</td>
             <td>${e.property}</td>
             <td>${formatDateLocal(e.escalation_date)}</td>
             <td class="text-right">${formatZAR(e.current_rent_cents)}</td>
             <td class="text-right text-success">${formatZAR(e.next_rent_cents)}</td>
             <td class="text-right">+${e.escalation_percent}%</td>
           </tr>
         `).join("")}
       </table>`
    : `<p class="text-muted" style="font-size:10px;margin-bottom:12px;">No escalations scheduled in the next 12 months.</p>`

  const depositsSection = `
    <h3>Deposits Held</h3>
    <table>
      <tr>
        <th>Property</th><th>Unit</th><th>Tenant</th>
        <th class="text-right">Deposit</th><th class="text-right">Months</th>
      </tr>
      ${data.properties.flatMap((p) => p.units.filter((u) => u.tenant_name && u.deposit_cents > 0).map((u) => `
        <tr>
          <td>${p.name}</td><td>${u.unit_number}</td>
          <td>${u.tenant_name}</td>
          <td class="text-right">${formatZAR(u.deposit_cents)}</td>
          <td class="text-right${u.deposit_months < 2 ? " text-warning" : ""}">${u.deposit_months}×</td>
        </tr>
      `)).join("")}
      <tr style="font-weight:700;">
        <td colspan="3">Total</td>
        <td class="text-right">${formatZAR(data.totals.deposits_held_cents)}</td>
        <td></td>
      </tr>
    </table>
  `

  return `
    <div class="page-break">
      <h2>Compliance &amp; Key Dates</h2>
      ${cpaSection}
      <hr class="section-rule">
      ${escSection}
      <hr class="section-rule">
      ${depositsSection}
    </div>
  `
}

// ── Page 6: AI Recommendations ────────────────────────────────────────────────

function buildPage6(recs: Recommendation[], accent: string): string {
  const items = recs.map((r) => `
    <div class="rec-item">
      <div class="rec-title">
        ${priorityBadge(r.priority, accent)}${r.title}
      </div>
      <div class="rec-body">${r.body}</div>
      ${r.financial_impact ? `<div class="rec-impact">💰 ${r.financial_impact}</div>` : ""}
    </div>
  `).join("")

  return `
    <div class="page-break">
      <h2>Recommendations</h2>
      <p class="text-muted" style="margin-bottom:12px;font-size:10px;">
        Based on your portfolio as at ${formatDateShort(new Date())}. Prioritised by urgency.
      </p>
      ${items || "<p class='text-muted'>No recommendations at this time.</p>"}
    </div>
  `
}

// ── Master builder ────────────────────────────────────────────────────────────

export function buildWelcomePackHTML(
  data: WelcomePackData,
  recs: Recommendation[],
  org: ReportBranding,
): string {
  const css = getWelcomeCSS(org)
  const fontLink = getFontLink(org.font)
  const accent = org.accent_color

  const coverSubtitle = `Prepared for: ${data.landlord_name} &nbsp;·&nbsp; ${formatDateShort(data.generated_at)}`
  const footer = `<div class="footer">Generated by Pleks · pleks.co.za — ${formatDateShort(new Date())}</div>`

  const body = `
    ${letterhead(org)}
    <h1>Portfolio Welcome Pack</h1>
    <div class="subtitle">${coverSubtitle}</div>
    <hr class="accent">
    ${buildPage1(data, org)}
    ${buildPage2(data)}
    ${buildPage3(data)}
    ${buildPage4(data)}
    ${buildPage5(data)}
    ${buildPage6(recs, accent)}
    ${footer}
  `

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${fontLink}<style>${css}</style></head><body>${body}</body></html>`
}
