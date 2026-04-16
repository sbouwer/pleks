/**
 * Template registry — every outbound communication template across all modules.
 * Components are wired in as each module's templates are built.
 * is_mandatory = true → bypasses communication_preferences checks (legal requirement).
 */

export type TemplateChannel  = "email" | "sms" | "both"
export type TemplateCategory = "applications" | "arrears" | "maintenance" | "inspections" | "leases" | "deposits" | "statements" | "subscriptions" | "portal" | "reports"

export interface TemplateEntry {
  key: string
  channel: TemplateChannel
  category: TemplateCategory
  is_mandatory: boolean    // true = letter of demand, CPA s14, deposit return, dispute notice
  description: string
}

export const TEMPLATE_REGISTRY: Record<string, TemplateEntry> = {
  // ── Applications ────────────────────────────────────────────────
  "application.received": {
    key: "application.received", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant confirmation on submit",
  },
  "application.agent_notify": {
    key: "application.agent_notify", channel: "email", category: "applications", is_mandatory: false,
    description: "Agent notified of new application",
  },
  "application.review_reminder": {
    key: "application.review_reminder", channel: "email", category: "applications", is_mandatory: false,
    description: "Agent reminder: applications unreviewed for 24h (cron)",
  },
  "application.shortlisted": {
    key: "application.shortlisted", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant invited to Stage 2 screening",
  },
  "application.declined_stage1": {
    key: "application.declined_stage1", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant not shortlisted after Stage 1",
  },
  "application.payment_received": {
    key: "application.payment_received", channel: "email", category: "applications", is_mandatory: false,
    description: "Screening fee R399 received — screening in progress",
  },
  "application.screening_complete": {
    key: "application.screening_complete", channel: "email", category: "applications", is_mandatory: false,
    description: "Agent notified: FitScore and screening results ready",
  },
  "application.approved": {
    key: "application.approved", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant approved — lease process begins",
  },
  "application.declined_stage2": {
    key: "application.declined_stage2", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant declined after Stage 2 screening",
  },

  // ── Arrears ──────────────────────────────────────────────────────
  "arrears.payment_reminder": {
    key: "arrears.payment_reminder", channel: "both", category: "arrears", is_mandatory: false,
    description: "Tenant: rent overdue 3+ days (cron)",
  },
  "arrears.letter_of_demand": {
    key: "arrears.letter_of_demand", channel: "email", category: "arrears", is_mandatory: true,
    description: "Formal letter of demand (legal document — cannot be unsubscribed)",
  },
  "arrears.final_notice": {
    key: "arrears.final_notice", channel: "email", category: "arrears", is_mandatory: true,
    description: "Final pre-cancellation notice (legal — cannot be unsubscribed)",
  },
  "arrears.payment_received": {
    key: "arrears.payment_received", channel: "email", category: "arrears", is_mandatory: false,
    description: "Payment received and allocated to arrears case",
  },
  "arrears.arrangement_confirm": {
    key: "arrears.arrangement_confirm", channel: "email", category: "arrears", is_mandatory: false,
    description: "Payment arrangement agreed and confirmed",
  },

  // ── Maintenance ──────────────────────────────────────────────────
  "maintenance.logged_tenant": {
    key: "maintenance.logged_tenant", channel: "both", category: "maintenance", is_mandatory: false,
    description: "Tenant: request logged, reference number",
  },
  "maintenance.logged_agent": {
    key: "maintenance.logged_agent", channel: "email", category: "maintenance", is_mandatory: false,
    description: "Agent notified of new maintenance request",
  },
  "maintenance.assigned": {
    key: "maintenance.assigned", channel: "both", category: "maintenance", is_mandatory: false,
    description: "Contractor assigned to request",
  },
  "maintenance.scheduled": {
    key: "maintenance.scheduled", channel: "both", category: "maintenance", is_mandatory: false,
    description: "Appointment date/time confirmed",
  },
  "maintenance.completed": {
    key: "maintenance.completed", channel: "both", category: "maintenance", is_mandatory: false,
    description: "Work marked complete by contractor",
  },
  "maintenance.landlord_approval": {
    key: "maintenance.landlord_approval", channel: "email", category: "maintenance", is_mandatory: false,
    description: "Cost exceeds threshold — landlord approval required",
  },
  "maintenance.emergency": {
    key: "maintenance.emergency", channel: "sms", category: "maintenance", is_mandatory: true,
    description: "Emergency maintenance alert — immediate action required",
  },

  // ── Inspections ──────────────────────────────────────────────────
  "inspection.scheduled": {
    key: "inspection.scheduled", channel: "both", category: "inspections", is_mandatory: false,
    description: "Inspection created and tenant notified",
  },
  "inspection.reminder": {
    key: "inspection.reminder", channel: "both", category: "inspections", is_mandatory: false,
    description: "24h reminder before scheduled inspection (cron)",
  },
  "inspection.report_ready": {
    key: "inspection.report_ready", channel: "email", category: "inspections", is_mandatory: false,
    description: "Inspection report published and available",
  },
  "inspection.dispute_window": {
    key: "inspection.dispute_window", channel: "email", category: "inspections", is_mandatory: true,
    description: "Move-out: 7-day dispute window notice (RHA requirement — cannot be unsubscribed)",
  },

  // ── Leases ───────────────────────────────────────────────────────
  "lease.created": {
    key: "lease.created", channel: "email", category: "leases", is_mandatory: false,
    description: "Lease created and sent to tenant for signing",
  },
  "lease.sign_reminder": {
    key: "lease.sign_reminder", channel: "email", category: "leases", is_mandatory: false,
    description: "Unsigned lease reminder after 3 days (cron)",
  },
  "lease.signed": {
    key: "lease.signed", channel: "email", category: "leases", is_mandatory: false,
    description: "All parties have signed — lease confirmed",
  },
  "lease.activated": {
    key: "lease.activated", channel: "email", category: "leases", is_mandatory: false,
    description: "Lease is now active",
  },
  "lease.renewal_notice": {
    key: "lease.renewal_notice", channel: "email", category: "leases", is_mandatory: true,
    description: "CPA s14 renewal notice 40-80 business days before expiry (legal — cannot be unsubscribed)",
  },
  "lease.expiry_reminder": {
    key: "lease.expiry_reminder", channel: "email", category: "leases", is_mandatory: true,
    description: "30-day expiry reminder (legal — cannot be unsubscribed)",
  },
  "lease.terminated": {
    key: "lease.terminated", channel: "email", category: "leases", is_mandatory: true,
    description: "Lease termination notice (legal — cannot be unsubscribed)",
  },
  "lease.document_emailed": {
    key: "lease.document_emailed", channel: "email", category: "leases", is_mandatory: false,
    description: "Agent manually emailed lease summary + portal link to tenant",
  },

  // ── Deposits ─────────────────────────────────────────────────────
  "deposit.received": {
    key: "deposit.received", channel: "email", category: "deposits", is_mandatory: false,
    description: "Deposit payment recorded",
  },
  "deposit.return_schedule": {
    key: "deposit.return_schedule", channel: "email", category: "deposits", is_mandatory: true,
    description: "Itemised deduction schedule (RHA s5(7) — cannot be unsubscribed)",
  },
  "deposit.returned": {
    key: "deposit.returned", channel: "email", category: "deposits", is_mandatory: true,
    description: "Deposit refunded (legal notification — cannot be unsubscribed)",
  },

  // ── Statements ───────────────────────────────────────────────────
  "statement.ready": {
    key: "statement.ready", channel: "email", category: "statements", is_mandatory: false,
    description: "Monthly owner statement generated and available",
  },

  // ── Subscriptions ─────────────────────────────────────────────────
  "subscription.activated": {
    key: "subscription.activated", channel: "email", category: "subscriptions", is_mandatory: false,
    description: "Subscription payment confirmed — welcome to paid tier",
  },
  "subscription.trial_expired": {
    key: "subscription.trial_expired", channel: "email", category: "subscriptions", is_mandatory: false,
    description: "Trial ended — reverted to Owner tier (cron)",
  },
  "subscription.trial_ending_soon": {
    key: "subscription.trial_ending_soon", channel: "email", category: "subscriptions", is_mandatory: false,
    description: "Trial expires in 2 days — upgrade CTA (cron)",
  },
  "subscription.founding_expiry_warning": {
    key: "subscription.founding_expiry_warning", channel: "email", category: "subscriptions", is_mandatory: false,
    description: "Founding agent pricing expires in 35 days — upgrade CTA (cron)",
  },

  // ── Portal ────────────────────────────────────────────────────────
  "portal.tenant_invite": {
    key: "portal.tenant_invite", channel: "email", category: "portal", is_mandatory: false,
    description: "Magic-link email inviting tenant to activate their portal account",
  },
  "portal.tenant_link": {
    key: "portal.tenant_link", channel: "sms", category: "portal", is_mandatory: false,
    description: "WhatsApp/SMS token link for tenants without email (generated link flow)",
  },
  "portal.maintenance_received": {
    key: "portal.maintenance_received", channel: "email", category: "portal", is_mandatory: false,
    description: "Tenant confirmation: maintenance request received via portal, reference number included",
  },
  "portal.maintenance_update": {
    key: "portal.maintenance_update", channel: "both", category: "portal", is_mandatory: false,
    description: "Tenant notified of status change on their portal-submitted maintenance request",
  },
  "portal.agent_maintenance_alert": {
    key: "portal.agent_maintenance_alert", channel: "email", category: "portal", is_mandatory: false,
    description: "Agent alerted when a tenant submits a maintenance request via the portal",
  },
  "portal.inspection_reschedule_response": {
    key: "portal.inspection_reschedule_response", channel: "both", category: "portal", is_mandatory: false,
    description: "Tenant notified of agent response (approved/declined/countered) to reschedule request",
  },

  // ── Reports ──────────────────────────────────────────────────────
  "reports.welcome_pack": {
    key: "reports.welcome_pack", channel: "email", category: "reports", is_mandatory: false,
    description: "Owner portfolio overview sent as HTML email",
  },
  "reports.tenant_welcome_pack": {
    key: "reports.tenant_welcome_pack", channel: "email", category: "reports", is_mandatory: false,
    description: "Tenant welcome pack — payment details, maintenance contacts, key lease dates",
  },

  // ── Application extras ────────────────────────────────────────────
  "application.co_applicant_invited": {
    key: "application.co_applicant_invited", channel: "email", category: "applications", is_mandatory: false,
    description: "Co-applicant invited to complete joint application",
  },
  "application.credit_report_delivered": {
    key: "application.credit_report_delivered", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant receives their FitScore and screening summary",
  },
}

/** Returns the template entry or throws if the key is unknown */
export function getTemplate(key: string): TemplateEntry {
  const entry = TEMPLATE_REGISTRY[key]
  if (!entry) throw new Error(`Unknown template key: ${key}`)
  return entry
}
