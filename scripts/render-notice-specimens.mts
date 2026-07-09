/**
 * scripts/render-notice-specimens.mts — dev-render the Demand-to-Vacate specimens for counsel handoff
 *
 * Renders FIVE specimens (both citation branches per CD): breach×CPA, breach×contractual, expiry×CPA,
 * expiry×contractual, m2m — via the SAME renderDemandNotice path the platform issues from, so counsel
 * reviews the exact artefact a tenant receives. Bodies are VERBATIM (no in-body watermark — the SPECIMEN
 * marking lives in the filenames + README, preserving the byte-identity story). Fictitious parties only.
 * Output: brief/legal/specimens/ (gitignored handoff bundle). Run: npx tsx scripts/render-notice-specimens.mts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { renderDemandNotice, type IssueTenantNoticeParams } from "../lib/notices/issueTenantNotice"
import { renderServiceNotificationSms, SERVICE_NOTIFICATION_VERSION } from "../lib/notices/serviceNotification"

const OUT = "brief/legal/specimens"
mkdirSync(OUT, { recursive: true })

const common = {
  db: null as never,
  orgId: "SPECIMEN",
  generatedBy: null,
  now: new Date("2026-07-09T09:00:00Z"),
  recipient: { tenantName: "Jane Q. Fictitious", serviceAddress: "999 Nonesuch Avenue, Faketown, Gauteng, 0000", emails: ["jane@example.invalid"], phones: [] },
  sureties: [],
  landlordOrAgentName: "Placeholder Property Management (Pty) Ltd",
  propertyLabel: "Unit 99, The Imaginary Heights",
  branding: { orgName: "Placeholder Property Management (Pty) Ltd", orgEmail: "notices@example.invalid", orgPhone: "000 000 0000" },
} as const

interface Spec { file: string; key: string; notice: string; branch: string; ref: string; lease: IssueTenantNoticeParams["lease"] }

const SPECIMENS: Spec[] = [
  { file: "01-breach-cpa.html", key: "notice.demand_vacate_breach", notice: "Notice 1 (breach cancellation)", branch: "breach:cpa", ref: "DTV-FICT0099-20260701",
    lease: { id: "SPEC", noticeType: "demand_vacate_breach", cpaApplies: "yes", finalNoticeDate: "1 May 2026", cancellationEffectiveDate: "9 July 2026", cancellationEffectiveISO: "2026-07-09" } },
  { file: "02-breach-contractual.html", key: "notice.demand_vacate_breach", notice: "Notice 1 (breach cancellation)", branch: "breach:contractual", ref: "DTV-FICT0099-20260702",
    lease: { id: "SPEC", noticeType: "demand_vacate_breach", cpaApplies: "no", finalNoticeDate: "1 May 2026", cancellationEffectiveDate: "9 July 2026", cancellationEffectiveISO: "2026-07-09" } },
  { file: "03-expiry-cpa.html", key: "notice.demand_vacate_expiry", notice: "Notice 2 (fixed-term expiry)", branch: "expiry:cpa", ref: "DTV-FICT0099-20260703",
    lease: { id: "SPEC", noticeType: "demand_vacate_expiry", cpaApplies: "yes", leaseEndDate: "30 June 2026" } },
  { file: "04-expiry-contractual.html", key: "notice.demand_vacate_expiry", notice: "Notice 2 (fixed-term expiry)", branch: "expiry:contractual", ref: "DTV-FICT0099-20260704",
    lease: { id: "SPEC", noticeType: "demand_vacate_expiry", cpaApplies: "no", leaseEndDate: "30 June 2026" } },
  { file: "05-m2m.html", key: "notice.demand_vacate_m2m", notice: "Notice 3 (month-to-month termination)", branch: "m2m:rha_s5_5", ref: "DTV-FICT0099-20260705",
    lease: { id: "SPEC", noticeType: "demand_vacate_m2m", cpaApplies: "no", terminationNoticeDate: "1 June 2026", leaseEndDate: "30 June 2026" } },
]

const rows: string[] = []
for (const s of SPECIMENS) {
  const params = { ...common, lease: s.lease, referenceNumber: s.ref } as IssueTenantNoticeParams
  const r = await renderDemandNotice(params)
  writeFileSync(`${OUT}/${s.file}`, r.bodyFull, "utf8")
  rows.push(`| \`${s.file}\` | \`${s.key}\` | ${s.notice} | \`${s.branch}\` | \`${r.contentHash.slice(0, 16)}…\` |`)
  console.log("wrote", s.file)
}

writeFileSync(`${OUT}/notice-of-service-sms.txt`,
  `Notice of Service — SMS/WhatsApp micro-template\n` +
  `template_key: notice.service_notification  ·  version: ${SERVICE_NOTIFICATION_VERSION}  ·  status: DRAFT (counsel Part F)\n\n` +
  `${renderServiceNotificationSms()}\n`, "utf8")
console.log("wrote notice-of-service-sms.txt")

writeFileSync(`${OUT}/README.md`,
  `# Demand-to-Vacate — specimen notices for counsel review\n\n` +
  `**Dev-rendered from the production render path** (\`renderDemandNotice\`), with **fictitious parties**. ` +
  `**No notice was issued** — these are the exact artefacts a tenant would receive, rendered for review only. ` +
  `Bodies are verbatim (no in-body watermark), so the file below is byte-identical to what the platform sends; ` +
  `the SPECIMEN marking lives here and in the filenames.\n\n` +
  `Companion to pack **O-16-R7.4**. The five HTML files cover both citation branches of the branchable notices ` +
  `(the branch string is the most legally load-bearing variable text); the SMS text is the fourth draft row ` +
  `counsel flips on sign-off.\n\n` +
  `| file | template_key | pack notice | citation branch | content_hash |\n` +
  `|---|---|---|---|---|\n${rows.join("\n")}\n\n` +
  `Plus \`notice-of-service-sms.txt\` — the SMS/WhatsApp notification-of-service micro-template.\n\n` +
  `Fictitious fixture: tenant "Jane Q. Fictitious", 999 Nonesuch Avenue, Unit 99 The Imaginary Heights, ` +
  `Placeholder Property Management (Pty) Ltd.\n`, "utf8")
console.log("wrote README.md")
