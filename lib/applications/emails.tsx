/**
 * Application email functions — all 9 templates per BUILD_48.
 * Uses JSX (tsx) so React.createElement type issues don't arise.
 */

import { EmailLayout, EmailButton, EmailSectionHeading, EmailDetail } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import { sendEmail } from "@/lib/comms/send-email"
import { formatZAR } from "@/lib/constants"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"
const SCREENING_FEE = "R399"

interface ApplicationSummary {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  employerName?: string
  employmentType?: string
  grossMonthlyIncomeCents?: number
  prescreenScore?: number
  prescreenTotal?: number
  rentToIncomePct?: number | null
  documentsComplete?: boolean
  bankStatementAvgIncomeCents?: number | null
  bankStatementBounced?: number | null
  bankStatementFlags?: string | null
}

interface ListingSummary {
  id: string
  unitLabel: string
  propertyName: string
  city?: string
  askingRentCents: number
  availableFrom?: string
}

interface OrgContext {
  orgId: string
  orgName: string
  orgEmail?: string
  orgPhone?: string
  agentEmail?: string
  agentName?: string
  branding: OrgBranding
}

function appRef(id: string) { return `APP-${id.slice(0, 8).toUpperCase()}` }
function statusUrl(slug: string, id: string, token: string) { return `${APP_URL}/apply/${slug}/status?token=${token}` }
function formatEmployment(type = ""): string {
  return ({ permanent: "Permanent", contract: "Contract", self_employed: "Self-employed", retired: "Retired", student: "Student", unemployed: "Unemployed", full_time: "Full-time", part_time: "Part-time", contractor: "Contractor" })[type] ?? type
}
function formatDate(d?: string) {
  if (!d) return ""
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

const S = {
  greeting: { fontSize: 15, color: "#18181b", margin: "0 0 12px" },
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  footer: { fontSize: 13, color: "#71717a", margin: "16px 0 0" },
} as const

// ── Email 1: Application received ─────────────────────────────────────────────

export async function sendApplicationReceived(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { slug: string; accessToken: string }
) {
  const ref = appRef(app.id)
  let level: string | null = null
  if (app.prescreenScore != null) {
    if (app.prescreenScore >= 38) { level = "Strong" }
    else if (app.prescreenScore >= 30) { level = "Good" }
    else if (app.prescreenScore >= 22) { level = "Borderline" }
    else { level = "Insufficient" }
  }

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.received",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: `Application received — ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`Application received for ${listing.unitLabel} at ${listing.propertyName}`} branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Thank you for applying for {listing.unitLabel} at {listing.propertyName}{listing.city ? `, ${listing.city}` : ""}. Your application reference is <strong>{ref}</strong>.</p>
        <EmailSectionHeading>What you applied for</EmailSectionHeading>
        <EmailDetail label="Property" value={`${listing.unitLabel} — ${listing.propertyName}`} />
        <EmailDetail label="Rent" value={`${formatZAR(listing.askingRentCents)}/month`} />
        {listing.availableFrom && <EmailDetail label="Available" value={formatDate(listing.availableFrom)} />}
        <EmailSectionHeading>Your application summary</EmailSectionHeading>
        <EmailDetail label="Name" value={`${app.firstName} ${app.lastName}`} />
        {app.employmentType && <EmailDetail label="Employment" value={`${formatEmployment(app.employmentType)}${app.employerName ? ` — ${app.employerName}` : ""}`} />}
        {app.grossMonthlyIncomeCents && <EmailDetail label="Stated income" value={`${formatZAR(app.grossMonthlyIncomeCents)}/month`} />}
        {level && app.prescreenScore != null && <EmailDetail label="Pre-screen" value={`${app.prescreenScore}/${app.prescreenTotal ?? 45} — ${level}`} />}
        <EmailSectionHeading>What happens next</EmailSectionHeading>
        <p style={S.body}>Your application will be reviewed within 48 hours. You&apos;ll receive an email when a decision has been made.</p>
        <EmailButton href={statusUrl(opts.slug, app.id, opts.accessToken)} accentColor={org.branding.accentColor}>Check your application status →</EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Thank you for applying for ${listing.unitLabel} at ${listing.propertyName}. Reference: ${ref}.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 2: Agent notification ───────────────────────────────────────────────

export async function sendAgentApplicationNotification(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { applicationsCount: number }
) {
  if (!org.agentEmail) return { success: false as const, error: "No agent email" }
  const reviewLink = `${APP_URL}/applications/${app.id}`
  const rentToIncome = app.rentToIncomePct != null ? `${app.rentToIncomePct.toFixed(1)}%` : "—"

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.agent_notify",
    to: { email: org.agentEmail, name: org.agentName ?? org.orgName },
    subject: `New application — ${app.firstName} ${app.lastName} for ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`New application: ${app.firstName} ${app.lastName}`} branding={org.branding}>
        <p style={S.body}>New application received for {listing.unitLabel} at {listing.propertyName}.</p>
        <EmailSectionHeading>Applicant</EmailSectionHeading>
        <EmailDetail label="Name" value={`${app.firstName} ${app.lastName}`} />
        <EmailDetail label="Email" value={app.email} />
        {app.phone && <EmailDetail label="Phone" value={app.phone} />}
        {app.employmentType && <EmailDetail label="Employment" value={`${formatEmployment(app.employmentType)}${app.employerName ? ` — ${app.employerName}` : ""}`} />}
        {app.grossMonthlyIncomeCents && <EmailDetail label="Income" value={`${formatZAR(app.grossMonthlyIncomeCents)}/month`} />}
        {app.prescreenScore != null && <EmailDetail label="Pre-screen" value={`${app.prescreenScore}/${app.prescreenTotal ?? 45}`} />}
        <EmailDetail label="Rent-to-income" value={rentToIncome} />
        <EmailDetail label="Documents" value={app.documentsComplete ? "Complete" : "Incomplete"} />
        {app.bankStatementAvgIncomeCents != null && (
          <>
            <EmailSectionHeading>Bank statement highlights</EmailSectionHeading>
            <EmailDetail label="Avg income" value={`${formatZAR(app.bankStatementAvgIncomeCents)}/month`} />
            <EmailDetail label="Bounced debits" value={String(app.bankStatementBounced ?? 0)} />
          </>
        )}
        <EmailButton href={reviewLink} accentColor={org.branding.accentColor}>Review application →</EmailButton>
        <p style={S.footer}>You now have {opts.applicationsCount} application{opts.applicationsCount !== 1 ? "s" : ""} for this listing.</p>
      </EmailLayout>
    ),
    bodyPreview: `New application: ${app.firstName} ${app.lastName}. Pre-screen: ${app.prescreenScore}/${app.prescreenTotal ?? 45}.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 3: Review reminder (cron) ───────────────────────────────────────────

export async function sendReviewReminder(
  org: OrgContext,
  pending: Array<{ name: string; listing: string; score: number; appliedAt: string }>
) {
  if (!org.agentEmail) return { success: false as const, error: "No agent email" }

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.review_reminder",
    to: { email: org.agentEmail, name: org.agentName ?? org.orgName },
    subject: `Reminder: ${pending.length} application${pending.length !== 1 ? "s" : ""} awaiting review`,
    emailElement: (
      <EmailLayout preview={`${pending.length} applications awaiting your review`} branding={org.branding}>
        <p style={S.body}>You have {pending.length} application{pending.length !== 1 ? "s" : ""} awaiting your review:</p>
        <div style={{ margin: "16px 0" }}>
          {pending.map((a, i) => (
            <p key={i} style={{ ...S.body, margin: "4px 0" }}>• {a.name} — {a.listing} — {a.score}/45 — applied {a.appliedAt}</p>
          ))}
        </div>
        <EmailButton href={`${APP_URL}/applications`} accentColor={org.branding.accentColor}>Review applications →</EmailButton>
        <p style={S.footer}>Timely reviews help you secure the best tenants.</p>
      </EmailLayout>
    ),
    bodyPreview: `${pending.length} applications need your review.`,
  })
}

// ── Email 4: Shortlisted ──────────────────────────────────────────────────────

export async function sendShortlistInvitation(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { inviteToken: string }
) {
  const inviteLink = `${APP_URL}/apply/invite/${opts.inviteToken}`

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.shortlisted",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: `Great news — you've been shortlisted for ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`You've been shortlisted for ${listing.unitLabel} at ${listing.propertyName}`} branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Great news — your application for {listing.unitLabel} at {listing.propertyName} has been shortlisted.</p>
        <EmailSectionHeading>Next step: Tenant screening</EmailSectionHeading>
        <p style={S.body}>To complete your application we need to run a credit and background check. This requires:</p>
        <p style={S.body}>1. Your consent (POPIA requirement)</p>
        <p style={S.body}>2. A screening fee of {SCREENING_FEE}</p>
        <p style={S.body}>The screening is conducted by Searchworx, an independent credit bureau. Results are shared with {org.orgName} only.</p>
        <EmailButton href={inviteLink} accentColor={org.branding.accentColor}>Continue to screening →</EmailButton>
        <p style={S.footer}>This link expires in 7 days.{org.orgPhone ? ` Contact: ${org.orgPhone}` : ""}{org.orgEmail ? ` · ${org.orgEmail}` : ""}</p>
      </EmailLayout>
    ),
    bodyPreview: `Your application for ${listing.unitLabel} at ${listing.propertyName} has been shortlisted.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 5: Not shortlisted (Stage 1) ────────────────────────────────────────

export async function sendDeclinedStage1(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { reason?: string }
) {
  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.declined_stage1",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: `Application update — ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`Application update — ${listing.unitLabel}, ${listing.propertyName}`} branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Thank you for your application for {listing.unitLabel} at {listing.propertyName}.</p>
        <p style={S.body}>{opts.reason
          ? `After careful consideration, we have decided not to proceed with your application. ${opts.reason}`
          : "After careful consideration, we have decided not to proceed with your application at this time."}</p>
        <p style={S.body}>This decision does not reflect on you personally — the agent received multiple applications and had to make a selection.</p>
        <EmailSectionHeading>Your data</EmailSectionHeading>
        <p style={S.body}>Your personal information will be retained for 12 months in accordance with POPIA. To request earlier deletion, contact {org.orgName}{org.orgEmail ? ` at ${org.orgEmail}` : ""}.</p>
        <p style={S.body}>We wish you well in finding your next home.</p>
      </EmailLayout>
    ),
    bodyPreview: "Thank you for your application. Unfortunately we are unable to proceed.",
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 6: Payment received ──────────────────────────────────────────────────

export async function sendPaymentReceived(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { paymentRef: string; slug: string; accessToken: string; amountCents: number; paidAt: string }
) {
  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.payment_received",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: "Payment received — screening in progress",
    emailElement: (
      <EmailLayout preview="Payment received — screening in progress" branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Your payment of {formatZAR(opts.amountCents)} has been received. Your tenant screening is now in progress.</p>
        <EmailSectionHeading>Payment details</EmailSectionHeading>
        <EmailDetail label="Reference" value={opts.paymentRef} />
        <EmailDetail label="Amount" value={formatZAR(opts.amountCents)} />
        <EmailDetail label="Date" value={formatDate(opts.paidAt)} />
        <EmailSectionHeading>What happens next</EmailSectionHeading>
        <p style={S.body}>The screening typically takes 1–2 business days. You&apos;ll receive an email when results are available.</p>
        <EmailButton href={statusUrl(opts.slug, app.id, opts.accessToken)} accentColor={org.branding.accentColor}>Check your application status →</EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Payment of ${formatZAR(opts.amountCents)} received. Screening in progress.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 7: Screening complete (agent) ───────────────────────────────────────

export async function sendScreeningComplete(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { fitScore: number; fitScoreSummary?: string; components?: Record<string, number> }
) {
  if (!org.agentEmail) return { success: false as const, error: "No agent email" }

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.screening_complete",
    to: { email: org.agentEmail, name: org.agentName ?? org.orgName },
    subject: `Screening complete — ${app.firstName} ${app.lastName} — FitScore ${opts.fitScore}/100`,
    emailElement: (
      <EmailLayout preview={`Screening complete — FitScore ${opts.fitScore}/100`} branding={org.branding}>
        <p style={S.body}>Tenant screening complete for {app.firstName} {app.lastName}.</p>
        <EmailSectionHeading>FitScore</EmailSectionHeading>
        <EmailDetail label="Overall" value={`${opts.fitScore}/100`} />
        {opts.components && Object.entries(opts.components).map(([k, v]) => (
          <EmailDetail key={k} label={k.replace(/_/g, " ")} value={`${v}/100`} />
        ))}
        {opts.fitScoreSummary && (
          <>
            <EmailSectionHeading>AI summary</EmailSectionHeading>
            <p style={S.body}>{opts.fitScoreSummary}</p>
          </>
        )}
        <EmailButton href={`${APP_URL}/applications/${app.id}`} accentColor={org.branding.accentColor}>Review full results →</EmailButton>
        <p style={S.footer}>Action required: Approve or decline this application.</p>
      </EmailLayout>
    ),
    bodyPreview: `FitScore: ${opts.fitScore}/100 for ${app.firstName} ${app.lastName}. Action required.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 8: Approved ─────────────────────────────────────────────────────────

export async function sendApproved(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext
) {
  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.approved",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: "Congratulations — your application has been approved!",
    emailElement: (
      <EmailLayout preview="Congratulations — your application has been approved!" branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Congratulations! Your application for {listing.unitLabel} at {listing.propertyName} has been approved.</p>
        <EmailSectionHeading>Next steps</EmailSectionHeading>
        <p style={S.body}>{org.orgName} will contact you to arrange:</p>
        <p style={S.body}>• Lease signing</p>
        <p style={S.body}>• Deposit payment</p>
        <p style={S.body}>• Move-in date and key collection</p>
        <p style={{ ...S.body, marginTop: 16 }}>Contact: {org.orgName}{org.orgPhone ? ` · ${org.orgPhone}` : ""}{org.orgEmail ? ` · ${org.orgEmail}` : ""}</p>
        <p style={{ ...S.body, marginTop: 8 }}>We look forward to welcoming you as a tenant.</p>
      </EmailLayout>
    ),
    bodyPreview: `Your application for ${listing.unitLabel} at ${listing.propertyName} has been approved.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 10: Co-applicant invited ───────────────────────────────────────────

export async function sendCoApplicantInvited(
  coApplicant: { firstName: string; email: string },
  listing: ListingSummary,
  org: OrgContext,
  opts: { accessToken: string; primaryApplicantName: string }
) {
  const inviteLink = `${APP_URL}/apply/co-applicant/${opts.accessToken}`

  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.co_applicant_invited",
    to: { email: coApplicant.email, name: coApplicant.firstName },
    subject: `You've been invited to a joint rental application — ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`Joint application invitation for ${listing.unitLabel} at ${listing.propertyName}`} branding={org.branding}>
        <p style={S.greeting}>Hi {coApplicant.firstName},</p>
        <p style={S.body}>
          {opts.primaryApplicantName} has included you as a co-applicant on their rental
          application for {listing.unitLabel} at {listing.propertyName}.
        </p>
        <EmailSectionHeading>What you need to do</EmailSectionHeading>
        <p style={S.body}>
          Click the button below to complete your portion of the joint application.
          This includes your personal details, income, and consent to a credit check.
        </p>
        <EmailButton href={inviteLink} accentColor={org.branding.accentColor}>Complete your co-applicant details →</EmailButton>
        <p style={S.footer}>
          This link is personal to you — do not share it.
          {org.orgPhone ? ` Questions? Contact ${org.orgName}: ${org.orgPhone}` : ""}
        </p>
      </EmailLayout>
    ),
    bodyPreview: `${opts.primaryApplicantName} has included you as a co-applicant for ${listing.unitLabel}, ${listing.propertyName}.`,
    entityType: "application",
  })
}

// ── Email 11: Credit report delivered ────────────────────────────────────────

export async function sendCreditReportDelivered(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { fitScore: number; components?: Record<string, number> }
) {
  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.credit_report_delivered",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: `Your screening results — ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`Your FitScore: ${opts.fitScore}/100 — screening complete`} branding={org.branding}>
        <p style={S.greeting}>Hi {app.firstName},</p>
        <p style={S.body}>
          Your tenant screening for {listing.unitLabel} at {listing.propertyName} is complete.
        </p>
        <EmailSectionHeading>Your FitScore</EmailSectionHeading>
        <p style={{ fontSize: 28, fontWeight: 700, color: "#18181b", margin: "8px 0 4px" }}>
          {opts.fitScore}<span style={{ fontSize: 16, color: "#71717a" }}>/100</span>
        </p>
        {opts.components && Object.keys(opts.components).length > 0 && (
          <>
            <EmailSectionHeading>Component breakdown</EmailSectionHeading>
            {Object.entries(opts.components).map(([k, v]) => (
              <EmailDetail key={k} label={k.replace(/_/g, " ")} value={`${v}/100`} />
            ))}
          </>
        )}
        <EmailSectionHeading>What was checked</EmailSectionHeading>
        <p style={S.body}>Credit score · Income-to-rent ratio · Rental payment history (TPN) · Employment · Judgements · Identity verification</p>
        <EmailSectionHeading>Your rights</EmailSectionHeading>
        <p style={S.body}>
          Under the National Credit Act, you may request a full copy of your credit report
          from TransUnion (transunion.co.za) and XDS (xds.co.za) at no charge once per year.
        </p>
        <p style={S.footer}>
          The agent for {listing.propertyName} has been notified.{" "}
          {org.orgPhone ? `Contact: ${org.orgPhone}` : ""}
        </p>
      </EmailLayout>
    ),
    bodyPreview: `Your FitScore: ${opts.fitScore}/100. Screening complete for ${listing.unitLabel}.`,
    entityType: "application",
    entityId: app.id,
  })
}

// ── Email 9: Declined Stage 2 ─────────────────────────────────────────────────

export async function sendDeclinedStage2(
  app: ApplicationSummary,
  listing: ListingSummary,
  org: OrgContext,
  opts: { reason?: string }
) {
  return sendEmail({
    orgId: org.orgId,
    templateKey: "application.declined_stage2",
    to: { email: app.email, name: `${app.firstName} ${app.lastName}` },
    subject: `Application update — ${listing.unitLabel}, ${listing.propertyName}`,
    emailElement: (
      <EmailLayout preview={`Application update — ${listing.unitLabel}, ${listing.propertyName}`} branding={org.branding}>
        <p style={S.greeting}>Dear {app.firstName},</p>
        <p style={S.body}>Thank you for your application for {listing.unitLabel} at {listing.propertyName}.</p>
        <p style={S.body}>{opts.reason
          ? `After completing the full screening, we have decided not to proceed. ${opts.reason}`
          : "After completing the full screening evaluation, we have decided not to proceed with your application."}</p>
        <p style={S.body}>The screening fee of R399 is non-refundable as communicated at the time of payment.</p>
        <EmailSectionHeading>Your data</EmailSectionHeading>
        <p style={S.body}>Your personal information will be retained for 12 months in accordance with POPIA. To request earlier deletion, contact {org.orgName}{org.orgEmail ? ` at ${org.orgEmail}` : ""}.</p>
        <p style={S.body}>We wish you well in finding your next home.</p>
      </EmailLayout>
    ),
    bodyPreview: "Thank you for your application. After full screening we are unable to proceed.",
    entityType: "application",
    entityId: app.id,
  })
}
