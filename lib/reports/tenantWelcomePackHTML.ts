import { formatZAR } from "@/lib/constants"
import { FONT_STACKS, getFontLink, type ReportBranding } from "./reportBranding"
import { formatOfficeHours, formatEmergencyLine } from "@/lib/org/operatingHours"
import { letterhead } from "./generatePDF"
import type { TenantWelcomePackData } from "./tenantWelcomePack"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateLocal(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function leaseTypeFriendly(type: string, isFixed: boolean): string {
  const t = type.charAt(0).toUpperCase() + type.slice(1)
  return `${t} — ${isFixed ? "Fixed term" : "Month to month"}`
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function getCSS(org: ReportBranding): string {
  const fontStack = FONT_STACKS[org.font] ?? FONT_STACKS.inter
  const accent = org.accent_color
  const accentLight = `${accent}1a`
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ${fontStack}; font-size: 11px; color: #1a1a1a; padding: 20mm 15mm; line-height: 1.5; }
header { margin-bottom: 12px; }
hr.accent { border: none; border-top: 2px solid ${accent}; margin: 8px 0 16px; }
hr.rule { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
h2 { font-size: 12px; font-weight: 700; margin: 18px 0 8px; color: ${accent}; text-transform: uppercase; letter-spacing: 0.05em; }
h3 { font-size: 11px; font-weight: 600; margin: 12px 0 4px; }
.subtitle { font-size: 10px; color: #64748b; margin-bottom: 16px; }
.page-break { page-break-before: always; padding-top: 4mm; }
.kv-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.kv-table td { padding: 5px 0; vertical-align: top; font-size: 11px; }
.kv-table td:first-child { width: 40%; color: #64748b; padding-right: 12px; }
.kv-table td:last-child { font-weight: 500; }
.section { background: #f8fafc; border-left: 3px solid ${accent}; padding: 10px 14px; margin-bottom: 12px; border-radius: 0 4px 4px 0; }
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${accent}; margin-bottom: 6px; }
.callout { background: ${accentLight}; border: 1px solid ${accent}33; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
.callout-label { font-size: 10px; font-weight: 700; color: ${accent}; margin-bottom: 3px; }
.warn { background: #fef9c3; border: 1px solid #fde047; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 10px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-amber { background: #fef3c7; color: #92400e; }
.badge-grey { background: #f1f5f9; color: #64748b; }
.icon { margin-right: 4px; }
.footer { margin-top: 24px; font-size: 8px; color: #94a3b8; text-align: center; }
.quick-ref { border: 2px solid ${accent}; border-radius: 8px; padding: 14px 18px; }
.quick-ref .qr-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${accent}; margin-bottom: 10px; }
.quick-ref table { width: 100%; border-collapse: collapse; }
.quick-ref td { padding: 4px 0; font-size: 11px; }
.quick-ref td:first-child { color: #64748b; width: 40%; }
.quick-ref td:last-child { font-weight: 600; }
.option-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; }
.option-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.option-num { min-width: 22px; height: 22px; border-radius: 50%; background: ${accent}; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
.sla-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.sla-card { border-radius: 6px; padding: 8px 10px; text-align: center; }
.sla-card .dot { font-size: 14px; margin-bottom: 3px; }
.sla-card .label { font-size: 9px; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
.sla-card .time { font-size: 12px; font-weight: 700; }
@media print { .no-print { display: none !important; } }
`
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

export interface TenantWelcomePackToolbar {
  leaseId: string
  tenantId: string
  tenantName: string
  tenantEmail: string | null
}

function buildToolbar(toolbar: TenantWelcomePackToolbar, accent: string): string {
  const hasEmail = !!toolbar.tenantEmail
  const safeName = toolbar.tenantName.replaceAll("<", "&lt;").replaceAll(">", "&gt;")

  const sendBtn = hasEmail
    ? `<button id="send-btn" onclick="sendPack()" style="background:${accent};color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">&#9993; Send to ${safeName}</button>`
    : `<button disabled title="No email address on file" style="background:#64748b;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;cursor:not-allowed;opacity:0.6;white-space:nowrap;">&#9993; No email on file</button>`

  const script = hasEmail ? `<script>
async function sendPack() {
  const btn = document.getElementById('send-btn');
  btn.disabled = true; btn.textContent = 'Sending\u2026';
  try {
    const res = await fetch('/api/reports/tenant-welcome-pack/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaseId: '${toolbar.leaseId}', tenantId: '${toolbar.tenantId}' })
    });
    const json = await res.json();
    if (json.error) {
      btn.textContent = '\u2715 ' + json.error;
      btn.style.background = '#dc2626';
      setTimeout(() => { btn.disabled = false; btn.innerHTML = '&#9993; Send to ${safeName}'; btn.style.background = '${accent}'; }, 4000);
    } else {
      btn.textContent = '\u2713 Sent!';
      btn.style.background = '#16a34a';
    }
  } catch {
    btn.textContent = '\u2715 Network error';
    btn.style.background = '#dc2626';
    setTimeout(() => { btn.disabled = false; btn.innerHTML = '&#9993; Send to ${safeName}'; btn.style.background = '${accent}'; }, 4000);
  }
}
${"</"}script>` : ""

  return `
  <div class="no-print" style="position:fixed;top:0;left:0;right:0;background:#1e293b;padding:10px 20px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
    <span style="color:#fff;font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Tenant Welcome Pack &mdash; ${safeName}</span>
    ${sendBtn}
    <button onclick="window.print()" style="background:rgba(255,255,255,0.12);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;white-space:nowrap;">&#128438; Print / PDF</button>
  </div>
  <div class="no-print" style="height:48px;"></div>
  ${script}
  `
}

// ── Page 1: Welcome & Your Agent ──────────────────────────────────────────────

function buildPage1(data: TenantWelcomePackData, org: ReportBranding): string {
  const officeHours = formatOfficeHours(org.hours)
  const emergencyLine = formatEmergencyLine(org.hours)
  const accent = org.accent_color

  const agentRows = [
    org.org_name ? `<tr><td>Property Manager</td><td><strong>${org.org_name}</strong></td></tr>` : "",
    org.phone ? `<tr><td>Phone</td><td>${org.phone}</td></tr>` : "",
    org.email ? `<tr><td>Email</td><td>${org.email}</td></tr>` : "",
    org.address ? `<tr><td>Office</td><td>${org.address}</td></tr>` : "",
    officeHours ? `<tr><td>Office hours</td><td>${officeHours}</td></tr>` : "",
    emergencyLine ? `<tr><td>After-hours emergency</td><td>${emergencyLine}</td></tr>` : "",
  ].filter(Boolean).join("")

  const emergencyInstructions = org.hours.emergencyInstructions
    ? `<div class="warn" style="margin-top:12px;">&#9888; ${org.hours.emergencyInstructions}</div>`
    : ""

  return `
    <p style="font-size:13px;line-height:1.7;margin-bottom:16px;">
      Dear ${data.tenantFirstName},
    </p>
    <p style="font-size:11px;line-height:1.8;margin-bottom:16px;">
      Welcome to <strong>${data.propertyName}${data.unitNumber ? `, Unit ${data.unitNumber}` : ""}</strong>.
      We're pleased to have you as a tenant and look forward to making your stay comfortable.
    </p>
    <p style="font-size:11px;line-height:1.8;margin-bottom:20px;">
      This document contains everything you need to know — from how to pay rent to
      how to report a maintenance issue. Please keep it somewhere accessible.
    </p>

    <h2 style="color:${accent};">Your Property Manager</h2>
    <table class="kv-table">
      ${agentRows}
    </table>
    ${emergencyInstructions}
  `
}

// ── Page 2: Lease at a Glance ─────────────────────────────────────────────────

function buildPage2(data: TenantWelcomePackData): string {
  const coTenantsRow = data.coTenants.length > 0
    ? `<tr><td>Co-tenants</td><td>${data.coTenants.join("<br>")}</td></tr>`
    : `<tr><td>Co-tenants</td><td><span style="color:#64748b">None</span></td></tr>`

  const newRentHtml = data.nextRentCents
    ? `<br><span style="color:#16a34a;">New rent: <strong>${formatZAR(data.nextRentCents)}/month</strong></span>`
    : ""
  const escalationRow = data.escalationPercent && data.escalationReviewDate
    ? `<tr><td>Escalation</td><td>${data.escalationPercent}% per annum — effective ${formatDateShort(data.escalationReviewDate)}${newRentHtml}</td></tr>`
    : ""

  const depositInterestSuffix = data.depositRateDescription ? ` — earns interest at ${data.depositRateDescription}` : ""
  const depositRow = `<tr><td>Deposit held</td><td>${formatZAR(data.depositAmountCents)}${depositInterestSuffix}</td></tr>`

  const keyDates: string[] = []
  if (data.cpaNoticeDueBy && data.endDate) {
    keyDates.push(`${formatDateShort(data.cpaNoticeDueBy)} — CPA renewal notice (we will contact you)`)
  }
  if (data.moveOutNoticeDeadline && data.endDate) {
    keyDates.push(`${formatDateShort(data.moveOutNoticeDeadline)} — Move-out notice deadline (if not renewing)`)
  }
  if (data.endDate) {
    keyDates.push(`${formatDateShort(data.endDate)} — Lease end date`)
  }

  const keyDateItems = keyDates.map((d) => `<li>${d}</li>`).join("")
  const keyDatesHtml = keyDates.length > 0
    ? `<h3>Important dates</h3><ul style="margin-top:4px;margin-left:16px;font-size:10.5px;line-height:1.9;">${keyDateItems}</ul>`
    : ""

  return `
    <div class="page-break">
      <h2>Your Lease at a Glance</h2>
      <table class="kv-table">
        <tr><td>Property</td><td><strong>${data.propertyName}</strong></td></tr>
        ${data.propertyAddress ? `<tr><td>Address</td><td>${data.propertyAddress}</td></tr>` : ""}
        ${data.unitNumber ? `<tr><td>Unit</td><td>${data.unitNumber}</td></tr>` : ""}
        <tr><td>Lease type</td><td>${leaseTypeFriendly(data.leaseType, data.isFixedTerm)}</td></tr>
        <tr><td>Start date</td><td>${formatDateLocal(data.startDate)}</td></tr>
        <tr><td>End date</td><td>${data.endDate ? formatDateLocal(data.endDate) : "Month-to-month"}</td></tr>
        <tr><td>Monthly rent</td><td><strong>${formatZAR(data.rentAmountCents)}</strong></td></tr>
        ${depositRow}
        ${escalationRow}
        ${coTenantsRow}
        <tr><td>Payment due</td><td>${data.paymentDueDay}</td></tr>
      </table>
      ${keyDatesHtml}
    </div>
  `
}

// ── Page 3: How to Pay Rent ───────────────────────────────────────────────────

function buildPage3(data: TenantWelcomePackData): string {
  const hasBank = data.trustBankName ?? data.trustAccountNumber

  const bankNameRow = data.trustBankName ? `<tr><td>Bank</td><td>${data.trustBankName}</td></tr>` : ""
  const accountHolderRow = data.trustAccountHolder ? `<tr><td>Account holder</td><td>${data.trustAccountHolder}</td></tr>` : ""
  const accountNumberRow = data.trustAccountNumber ? `<tr><td>Account number</td><td><strong>${data.trustAccountNumber}</strong></td></tr>` : ""
  const branchCodeRow = data.trustBranchCode ? `<tr><td>Branch code</td><td>${data.trustBranchCode}</td></tr>` : ""

  const eftSection = hasBank ? `
    <div class="option-row">
      <div class="option-num">1</div>
      <div>
        <div style="font-weight:600;margin-bottom:4px;">EFT / Bank Transfer (preferred)</div>
        <table class="kv-table" style="margin-bottom:0;">
          ${bankNameRow}
          ${accountHolderRow}
          ${accountNumberRow}
          ${branchCodeRow}
          <tr><td>Payment reference</td><td><strong style="font-size:12px;letter-spacing:0.03em;">${data.paymentReference}</strong></td></tr>
        </table>
        <div style="margin-top:6px;font-size:10px;color:#64748b;">&#128073; Always use this exact reference so we can match your payment.</div>
      </div>
    </div>
  ` : `<p style="color:#64748b;font-size:10px;margin-bottom:12px;">Please contact your property manager for bank details.</p>`

  let debiCheckLabel = "Not set up"
  let debiCheckBadge = `<span class="badge badge-grey">Not set up</span>`
  let debiStatusNote = " — your agent will set this up if applicable."
  if (data.debiCheckStatus === "active") {
    debiCheckLabel = "Active — rent will be collected automatically"
    debiCheckBadge = `<span class="badge badge-green">Active</span>`
    debiStatusNote = ` — collected on the ${data.paymentDueDay}.`
  } else if (data.debiCheckStatus === "pending") {
    debiCheckLabel = "Pending authentication"
    debiCheckBadge = `<span class="badge badge-amber">Pending</span>`
    debiStatusNote = " — please complete authentication at your bank."
  }

  const debiSection = `
    <div class="option-row">
      <div class="option-num">2</div>
      <div>
        <div style="font-weight:600;margin-bottom:4px;">DebiCheck (automatic collection)</div>
        <div style="font-size:11px;">Status: ${debiCheckBadge}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px;">${debiCheckLabel}${debiStatusNote}</div>
      </div>
    </div>
  `

  let arrearMarginText = ""
  if (data.arrearInterestMarginPercent !== null) {
    arrearMarginText = ` + ${data.arrearInterestMarginPercent}%`
  }

  const lateSection = data.arrearInterestEnabled
    ? `<div class="warn">&#9888; <strong>Late payment:</strong> Rent is due on the ${data.paymentDueDay}. Arrears may attract interest at prime${arrearMarginText} per the lease agreement.</div>`
    : `<div class="warn">&#9888; <strong>Late payment:</strong> Rent is due on the ${data.paymentDueDay}. Persistent late payment may result in legal action as per the lease agreement.</div>`

  return `
    <div class="page-break">
      <h2>How to Pay Your Rent</h2>
      <div style="margin-bottom:14px;">
        ${eftSection}
        ${debiSection}
      </div>
      ${lateSection}
    </div>
  `
}

// ── Page 4: Reporting Maintenance ─────────────────────────────────────────────

function buildPage4(data: TenantWelcomePackData, org: ReportBranding): string {
  const portalUrl = data.tenantPortalUrl
  const officeHours = formatOfficeHours(org.hours)
  const emergencyPhone = org.hours.emergencyPhone ?? org.phone

  const tenantEmailRow = data.tenantEmail
    ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">Log in with your email: ${data.tenantEmail}</div>`
    : ""
  const portalSection = portalUrl
    ? `<div class="option-row">
        <div class="option-num">1</div>
        <div>
          <div style="font-weight:600;margin-bottom:4px;">Online — Tenant Portal (fastest, available 24/7)</div>
          <div style="font-size:11px;">Visit: <strong>${portalUrl}</strong></div>
          ${tenantEmailRow}
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Click "Report an issue", describe the problem and attach a photo. We'll respond within 24 hours.</div>
        </div>
      </div>`
    : ""

  const phoneStepNum = portalUrl ? "2" : "1"
  const officeHoursSuffix = officeHours ? ` (${officeHours})` : ""
  const orgPhoneRow = org.phone ? `<div style="font-size:11px;">Office: <strong>${org.phone}</strong>${officeHoursSuffix}</div>` : ""
  const emergencyPhoneRow = emergencyPhone && emergencyPhone !== org.phone
    ? `<div style="font-size:11px;">After-hours emergency: <strong>${emergencyPhone}</strong></div>`
    : ""
  const phoneSection = `
    <div class="option-row">
      <div class="option-num">${phoneStepNum}</div>
      <div>
        <div style="font-weight:600;margin-bottom:4px;">By Phone</div>
        ${orgPhoneRow}
        ${emergencyPhoneRow}
      </div>
    </div>
  `

  const emailStepNum = portalUrl ? "3" : "2"
  const emailSection = org.email
    ? `<div class="option-row">
        <div class="option-num">${emailStepNum}</div>
        <div>
          <div style="font-weight:600;margin-bottom:4px;">By Email</div>
          <div style="font-size:11px;">${org.email}</div>
        </div>
      </div>`
    : ""

  return `
    <div class="page-break">
      <h2>Reporting a Maintenance Issue</h2>
      <div style="margin-bottom:14px;">
        ${portalSection}
        ${phoneSection}
        ${emailSection}
      </div>

      <h3>What counts as an emergency?</h3>
      <ul style="margin:6px 0 12px 16px;font-size:10.5px;line-height:2;">
        <li>No water or electricity</li>
        <li>Burst pipe or flooding</li>
        <li>Gas leak</li>
        <li>Broken lock or security breach</li>
        <li>Fire damage</li>
      </ul>
      <div style="font-size:10px;color:#64748b;margin-bottom:14px;">For emergencies, call immediately — do not wait for the portal.</div>

      <h3>Response times</h3>
      <div class="sla-grid">
        <div class="sla-card" style="background:#fee2e2;">
          <div class="dot">&#128308;</div>
          <div class="label">Emergency</div>
          <div class="time">4 hours</div>
        </div>
        <div class="sla-card" style="background:#fef3c7;">
          <div class="dot">&#128992;</div>
          <div class="label">Urgent</div>
          <div class="time">24 hours</div>
        </div>
        <div class="sla-card" style="background:#dcfce7;">
          <div class="dot">&#128994;</div>
          <div class="label">Routine</div>
          <div class="time">72 hours</div>
        </div>
      </div>
    </div>
  `
}

// ── Page 5: Key Terms ─────────────────────────────────────────────────────────

function buildPage5(data: TenantWelcomePackData): string {
  const depositInterestClause = data.depositRateDescription ? ` and earns interest at ${data.depositRateDescription}` : ""
  const depositNote = data.depositAmountCents > 0
    ? `Your deposit of <strong>${formatZAR(data.depositAmountCents)}</strong> is held in a trust account${depositInterestClause}. It will be returned within <strong>14 days</strong> of your move-out inspection if there is no damage, or within <strong>21 days</strong> if deductions apply. You will receive an itemised schedule for any deductions.`
    : "Please refer to your lease for deposit terms."

  const moveInDate = data.moveInInspectionDate
    ? `A move-in inspection was conducted on ${formatDateShort(data.moveInInspectionDate)}.`
    : "A move-in inspection will be or has been conducted — please retain your copy."

  const endDateDisplay = data.endDate ? formatDateShort(data.endDate) : "the end date"
  const noticeTerms = data.isFixedTerm
    ? `Your lease ends automatically on <strong>${endDateDisplay}</strong>. The Consumer Protection Act requires us to notify you 40–80 business days before expiry about renewal options. If you wish to vacate early, a cancellation penalty may apply as per the lease.`
    : `This is a month-to-month tenancy. Either party may give <strong>${data.noticePeriodDays} days</strong> written notice to terminate.`

  const clauseItems = data.clauseTitles.map((t) => `<li>${t}</li>`).join("")
  const additionalClauses = data.clauseTitles.length > 0
    ? `<h3 style="margin-top:14px;">Additional terms applicable to your lease</h3>
       <ul style="margin:6px 0 0 16px;font-size:10.5px;line-height:2.0;">${clauseItems}</ul>`
    : ""

  return `
    <div class="page-break">
      <h2>Important Lease Terms</h2>

      <h3>Deposit</h3>
      <p style="font-size:11px;line-height:1.7;margin-bottom:12px;">${depositNote}</p>

      <h3>Inspections</h3>
      <p style="font-size:11px;line-height:1.7;margin-bottom:12px;">
        ${moveInDate} Routine inspections may be scheduled with 24 hours' notice.
        A move-out inspection will be conducted on your last day or shortly before.
      </p>

      <h3>Notice to vacate</h3>
      <p style="font-size:11px;line-height:1.7;margin-bottom:12px;">${noticeTerms}</p>

      <h3>Alterations</h3>
      <p style="font-size:11px;line-height:1.7;margin-bottom:12px;">
        No structural alterations are permitted without written consent from the landlord.
        Cosmetic changes may also require prior written approval.
      </p>

      ${additionalClauses}
    </div>
  `
}

// ── Page 6: Quick Reference Card ─────────────────────────────────────────────

function buildPage6(data: TenantWelcomePackData, org: ReportBranding): string {
  const emergencyPhone = org.hours.emergencyPhone ?? org.phone ?? "—"
  const maintenanceContact = data.tenantPortalUrl ?? org.phone ?? "—"

  const bankRow = data.trustBankName && data.trustAccountNumber
    ? `<tr><td>Bank</td><td>${data.trustBankName} — ${data.trustAccountNumber}</td></tr>`
    : ""
  const leaseEndRow = data.endDate
    ? `<tr><td style="padding-top:10px;">Lease end</td><td style="padding-top:10px;">${formatDateShort(data.endDate)}</td></tr>`
    : ""
  const cpaRow = data.cpaNoticeDueBy && data.endDate
    ? `<tr><td>CPA notice date</td><td>${formatDateShort(data.cpaNoticeDueBy)}</td></tr>`
    : ""
  const agentPhone = org.phone ? ` — ${org.phone}` : ""
  const agentEmail = org.email ? `<br>${org.email}` : ""
  const portalRow = data.tenantPortalUrl
    ? `<tr><td>Tenant portal</td><td>${data.tenantPortalUrl}</td></tr>`
    : ""

  return `
    <div class="page-break">
      <h2>Quick Reference — Keep This Page</h2>
      <p style="font-size:10px;color:#64748b;margin-bottom:12px;">
        This summary page is designed to be pinned on the fridge or saved on your phone.
      </p>

      <div class="quick-ref">
        <div class="qr-title">Your key details at a glance</div>
        <table>
          <tr><td>Monthly rent</td><td>${formatZAR(data.rentAmountCents)} — due ${data.paymentDueDay}</td></tr>
          <tr><td>Payment reference</td><td style="font-size:12px;letter-spacing:0.03em;">${data.paymentReference}</td></tr>
          ${bankRow}
          <tr><td style="padding-top:10px;">Report maintenance</td><td style="padding-top:10px;">${maintenanceContact}</td></tr>
          <tr><td>After-hours emergency</td><td>${emergencyPhone}</td></tr>
          ${leaseEndRow}
          ${cpaRow}
          <tr><td style="padding-top:10px;">Your agent</td><td style="padding-top:10px;">${org.org_name}${agentPhone}${agentEmail}</td></tr>
          ${portalRow}
        </table>
      </div>

      <p style="font-size:9px;color:#94a3b8;margin-top:10px;text-align:center;">
        View your lease, payment history, and maintenance requests online at your tenant portal.
      </p>
    </div>
  `
}

// ── Master builder ────────────────────────────────────────────────────────────

export function buildTenantWelcomePackHTML(
  data: TenantWelcomePackData,
  org: ReportBranding,
  toolbar?: TenantWelcomePackToolbar,
): string {
  const css = getCSS(org)
  const fontLink = getFontLink(org.font)
  const accent = org.accent_color

  const dateStr = data.generatedAt.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const footer = `<div class="footer">Generated by Pleks · pleks.co.za — ${dateStr}</div>`
  const toolbarHtml = toolbar ? buildToolbar(toolbar, accent) : ""

  const body = `
    ${toolbarHtml}
    ${letterhead(org)}
    <h1>Welcome to ${data.propertyName}${data.unitNumber ? `, Unit ${data.unitNumber}` : ""}</h1>
    <div class="subtitle">Tenant Welcome Pack &nbsp;·&nbsp; Prepared for ${data.tenantName} &nbsp;·&nbsp; ${dateStr}</div>
    <hr class="accent">
    ${buildPage1(data, org)}
    ${buildPage2(data)}
    ${buildPage3(data)}
    ${buildPage4(data, org)}
    ${buildPage5(data)}
    ${buildPage6(data, org)}
    ${footer}
  `

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${fontLink}<style>${css}</style></head><body>${body}</body></html>`
}
