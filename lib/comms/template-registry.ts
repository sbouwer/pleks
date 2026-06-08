/**
 * lib/comms/template-registry.ts — every outbound communication template across all modules.
 *
 * Data:   static registry; tone_profile + allowed_channels drive router decisions (BUILD_63)
 * Notes:  is_mandatory=true bypasses communication_preferences (legal requirement)
 *         tone_profile drives channel-router channel priority (BUILD_63)
 *         allowed_channels constrains which channels the router may use per template
 */

export type TemplateChannel  = "email" | "sms" | "whatsapp" | "both"
export type TemplateCategory = "applications" | "arrears" | "maintenance" | "inspections" | "leases" | "deposits" | "statements" | "subscriptions" | "portal" | "reports" | "onboarding" | "insurance" | "feedback" | "rent" | "notices" | "popia"
export type ToneProfile      = "transactional" | "relational" | "legal"

export interface TemplateEntry {
  key: string
  channel: TemplateChannel
  category: TemplateCategory
  is_mandatory: boolean
  description: string
  tone_profile?: ToneProfile
  allowed_channels?: Array<"whatsapp" | "sms" | "email">
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
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Formal letter of demand (legal document — cannot be unsubscribed)",
  },
  "arrears.final_notice": {
    key: "arrears.final_notice", channel: "email", category: "arrears", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
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
    tone_profile: "relational", allowed_channels: ["whatsapp", "email", "sms"],
    description: "Tenant: request logged, reference number",
  },
  "maintenance.logged_agent": {
    key: "maintenance.logged_agent", channel: "email", category: "maintenance", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Agent notified of new maintenance request",
  },
  "maintenance.assigned": {
    key: "maintenance.assigned", channel: "both", category: "maintenance", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "email", "sms"],
    description: "Contractor assigned — tenant notified (M2)",
  },
  "maintenance.scheduled": {
    key: "maintenance.scheduled", channel: "both", category: "maintenance", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "email", "sms"],
    description: "Appointment confirmed — tenant notified with date/time (M3)",
  },
  "maintenance.completed": {
    key: "maintenance.completed", channel: "both", category: "maintenance", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "email", "sms"],
    description: "Work marked complete — tenant notified (M4)",
  },
  "maintenance.landlord_approval": {
    key: "maintenance.landlord_approval", channel: "email", category: "maintenance", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Cost exceeds threshold — landlord approval required",
  },
  "maintenance.work_order": {
    key: "maintenance.work_order", channel: "email", category: "maintenance", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Work order dispatched to contractor with token-protected portal link",
  },
  "maintenance.emergency": {
    key: "maintenance.emergency", channel: "sms", category: "maintenance", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email", "sms", "whatsapp"],
    description: "Emergency maintenance alert — immediate action required",
  },

  // ── Inspections ──────────────────────────────────────────────────
  "inspection.scheduled": {
    key: "inspection.scheduled", channel: "both", category: "inspections", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "email"],
    description: "Inspection created and tenant notified",
  },
  "inspection.reminder": {
    key: "inspection.reminder", channel: "both", category: "inspections", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "sms", "email"],
    description: "24h reminder before scheduled inspection (cron)",
  },
  "inspection.report_ready": {
    key: "inspection.report_ready", channel: "email", category: "inspections", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Inspection report published and available",
  },
  "inspection.dispute_window": {
    key: "inspection.dispute_window", channel: "email", category: "inspections", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Move-out: 7-day procedural dispute window before deposit return schedule — s5(3)(c) joint inspection (cannot be unsubscribed)",
  },

  // ── Leases ───────────────────────────────────────────────────────
  "lease.created": {
    key: "lease.created", channel: "email", category: "leases", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Lease created and sent to tenant for signing",
  },
  "lease.sign_reminder": {
    key: "lease.sign_reminder", channel: "email", category: "leases", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["whatsapp", "email"],
    description: "Unsigned lease reminder after 3 days (cron)",
  },
  "lease.signed": {
    key: "lease.signed", channel: "email", category: "leases", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "All parties have signed — lease confirmed",
  },
  "lease.activated": {
    key: "lease.activated", channel: "email", category: "leases", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Lease is now active — welcome comm with portal link",
  },
  "lease.renewal_notice": {
    key: "lease.renewal_notice", channel: "email", category: "leases", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "CPA s14 renewal notice 40-80 business days before expiry (legal — cannot be unsubscribed)",
  },
  "lease.expiry_reminder": {
    key: "lease.expiry_reminder", channel: "email", category: "leases", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "30-day expiry reminder (legal — cannot be unsubscribed)",
  },
  "lease.terminated": {
    key: "lease.terminated", channel: "email", category: "leases", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Lease termination notice (legal — cannot be unsubscribed)",
  },
  "lease.document_emailed": {
    key: "lease.document_emailed", channel: "email", category: "leases", is_mandatory: false,
    description: "Agent manually emailed lease summary + portal link to tenant",
  },

  // ── Deposits ─────────────────────────────────────────────────────
  "deposit.received": {
    key: "deposit.received", channel: "email", category: "deposits", is_mandatory: false,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Deposit payment received and held in trust — confirmation to tenant on lease activation",
  },
  "deposit.return_schedule": {
    key: "deposit.return_schedule", channel: "email", category: "deposits", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Itemised deduction schedule (RHA s5(7) — cannot be unsubscribed)",
  },
  "deposit.returned": {
    key: "deposit.returned", channel: "email", category: "deposits", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
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
  "subscription.payment_failed": {
    key: "subscription.payment_failed", channel: "email", category: "subscriptions", is_mandatory: true,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Payment could not be collected — 14-day grace period starts (billing cascade day 0)",
  },
  "subscription.payment_reminder": {
    key: "subscription.payment_reminder", channel: "email", category: "subscriptions", is_mandatory: true,
    tone_profile: "transactional", allowed_channels: ["email"],
    description: "Payment still overdue — reminder sent ~day 4 of grace period (billing cascade)",
  },
  "subscription.account_frozen": {
    key: "subscription.account_frozen", channel: "email", category: "subscriptions", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Grace period elapsed — account frozen, premium features suspended (billing cascade day 14)",
  },

  // ── Portal ────────────────────────────────────────────────────────
  "portal.tenant_invite": {
    key: "portal.tenant_invite", channel: "email", category: "portal", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["email"],
    description: "Magic-link email inviting tenant to activate their portal account — auto-fires on lease activation (P1)",
  },
  "team.member_invite": {
    key: "team.member_invite", channel: "email", category: "portal", is_mandatory: false,
    tone_profile: "relational", allowed_channels: ["email"],
    description: "Email inviting a colleague to join the agency as a team member — accept link to /invite/[token]",
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
  "application.director_invited": {
    key: "application.director_invited", channel: "email", category: "applications", is_mandatory: false,
    description: "Surety director invited to complete their portion of a commercial application",
  },
  "application.director_reminder_t3": {
    key: "application.director_reminder_t3", channel: "email", category: "applications", is_mandatory: false,
    description: "Day-3 gentle reminder to director whose portion is still outstanding",
  },
  "application.director_reminder_t7": {
    key: "application.director_reminder_t7", channel: "email", category: "applications", is_mandatory: false,
    description: "Day-7 reminder to director (+ SMS) — portion outstanding",
  },
  "application.director_reminder_t10": {
    key: "application.director_reminder_t10", channel: "email", category: "applications", is_mandatory: false,
    description: "Day-10 final reminder to director before expiry",
  },
  "application.director_expired_refund": {
    key: "application.director_expired_refund", channel: "email", category: "applications", is_mandatory: false,
    description: "Director's portion expired; if paid, refund flagged for agency",
  },
  "application.primary_contact_director_pending": {
    key: "application.primary_contact_director_pending", channel: "email", category: "applications", is_mandatory: false,
    description: "Primary contact notified that one or more directors have not yet completed their portions",
  },
  "application.credit_report_delivered": {
    key: "application.credit_report_delivered", channel: "email", category: "applications", is_mandatory: false,
    description: "Applicant receives their FitScore and screening summary",
  },
  // ADDENDUM_14F — consent verification SMS (sent via sendConsentSMS, bypasses tier gate)
  "consent.verification_standard": {
    key: "consent.verification_standard", channel: "sms", category: "applications", is_mandatory: true,
    description: "6-digit OTP for s11(1)(a) standard screening consent verification",
  },
  "consent.verification_special_info": {
    key: "consent.verification_special_info", channel: "sms", category: "applications", is_mandatory: true,
    description: "6-digit OTP for s27(1)(a) Estate criminal-check consent verification (distinct SMS round)",
  },

  // ── Critical incident notifications (BUILD_59) ────────────────────
  "incident.critical_broker": {
    key: "incident.critical_broker", channel: "email", category: "maintenance", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Insurance broker notified of critical property incident",
  },
  "incident.critical_owner": {
    key: "incident.critical_owner", channel: "email", category: "maintenance", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Owner paper-trail notification of critical property incident",
  },
  "incident.critical_scheme": {
    key: "incident.critical_scheme", channel: "email", category: "maintenance", is_mandatory: true,
    tone_profile: "legal", allowed_channels: ["email"],
    description: "Managing scheme / body corporate notified of critical property incident",
  },

  // ── Property info requests (BUILD_60 Phase 13; full templates in Phase 20) ─────
  "info_request.landlord":             { key: "info_request.landlord",             channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to confirm landlord/owner details" },
  "info_request.landlord_reminder":    { key: "info_request.landlord_reminder",    channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: landlord details still outstanding" },
  "info_request.insurance":            { key: "info_request.insurance",            channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to confirm insurance policy details" },
  "info_request.insurance_reminder":   { key: "info_request.insurance_reminder",   channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: insurance details still outstanding" },
  "info_request.broker":               { key: "info_request.broker",               channel: "email", category: "onboarding", is_mandatory: false, description: "Broker asked to confirm coverage details" },
  "info_request.broker_reminder":      { key: "info_request.broker_reminder",      channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: broker details still outstanding" },
  "info_request.scheme":               { key: "info_request.scheme",               channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to confirm managing scheme contact details" },
  "info_request.scheme_reminder":      { key: "info_request.scheme_reminder",      channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: managing scheme details still outstanding" },
  "info_request.banking":              { key: "info_request.banking",              channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to confirm banking details" },
  "info_request.banking_reminder":     { key: "info_request.banking_reminder",     channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: banking details still outstanding" },
  "info_request.documents":            { key: "info_request.documents",            channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to provide compliance documents" },
  "info_request.documents_reminder":   { key: "info_request.documents_reminder",   channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: compliance documents still outstanding" },
  "info_request.compliance":           { key: "info_request.compliance",           channel: "email", category: "onboarding", is_mandatory: false, description: "Owner asked to confirm compliance certificate details" },
  "info_request.compliance_reminder":  { key: "info_request.compliance_reminder",  channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: compliance certificate details still outstanding" },
  "info_request.other":                { key: "info_request.other",                channel: "email", category: "onboarding", is_mandatory: false, description: "Generic property info request" },
  "info_request.other_reminder":       { key: "info_request.other_reminder",       channel: "email", category: "onboarding", is_mandatory: false, description: "Reminder: generic property info request still outstanding" },
  "info_request.completion_notify":    { key: "info_request.completion_notify",    channel: "email", category: "onboarding", is_mandatory: false, description: "Notify requesting agent that the owner has submitted the info request" },
  "info_request.self_track_nudge":     { key: "info_request.self_track_nudge",     channel: "email", category: "onboarding", is_mandatory: false, description: "Internal nudge at T+30 days for self-track info requests the agent committed to follow up themselves" },

  // ── Insurance checklist (ADDENDUM_60A) ──────────────────────────────────────
  "insurance.checklist_brief":         { key: "insurance.checklist_brief",         channel: "email", category: "insurance",   is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Broker receives insurance coverage verification request with HTML brief attached" },
  "insurance.renewal_reminder":        { key: "insurance.renewal_reminder",        channel: "email", category: "insurance",   is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Agent reminded at T+7 post-renewal that checklist items are still unverified" },

  // ── Feedback (ADDENDUM_00F) ──────────────────────────────────────────────────
  "feedback.reply":                    { key: "feedback.reply",                    channel: "email", category: "feedback",    is_mandatory: false, description: "Submitter notified when a platform admin replies to their feedback" },
  "feedback.daily_digest":             { key: "feedback.daily_digest",             channel: "email", category: "feedback",    is_mandatory: false, description: "Daily digest of new feedback submissions sent to platform admin inbox" },

  // ── Rent lifecycle (BUILD_63) ─────────────────────────────────────────────
  "rent.invoice_issued":               { key: "rent.invoice_issued",               channel: "email",    category: "rent",        is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Monthly rent invoice issued to tenant" },
  "rent.payment_received":             { key: "rent.payment_received",             channel: "email",    category: "rent",        is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Rent payment receipt confirmed" },
  "rent.monthly_statement":            { key: "rent.monthly_statement",            channel: "email",    category: "rent",        is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Monthly account statement — all charges, payments, balance" },

  // ── Deposit extras (BUILD_63) ─────────────────────────────────────────────
  "deposit.interest_statement":        { key: "deposit.interest_statement",        channel: "email",    category: "deposits",    is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Annual deposit interest statement (NCA requirement)" },
  "deposit.pre_moveout_inspection":    { key: "deposit.pre_moveout_inspection",    channel: "email",    category: "deposits",    is_mandatory: false, tone_profile: "relational",    allowed_channels: ["email", "whatsapp"], description: "Pre-move-out inspection scheduled — tenant checklist reminder" },
  "deposit.dispute_resolution":        { key: "deposit.dispute_resolution",        channel: "email",    category: "deposits",    is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Deposit dispute raised — resolution process explained" },

  // ── Arrears lifecycle extras (BUILD_63) ───────────────────────────────────
  "arrears.reminder_step1":            { key: "arrears.reminder_step1",            channel: "sms",      category: "arrears",     is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "sms"],  description: "Step 1 arrears nudge — friendly tone (cron)" },
  "arrears.reminder_step2":            { key: "arrears.reminder_step2",            channel: "sms",      category: "arrears",     is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "sms", "email"], description: "Step 2 arrears reminder — escalated tone (cron)" },
  "arrears.resolved":                  { key: "arrears.resolved",                  channel: "email",    category: "arrears",     is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Arrears case closed — account up to date" },

  // ── Lease lifecycle extras (BUILD_63) ─────────────────────────────────────
  "lease.amended":                     { key: "lease.amended",                     channel: "email",    category: "leases",      is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Lease amendment executed and confirmed" },
  "lease.escalation_notice":           { key: "lease.escalation_notice",           channel: "email",    category: "leases",      is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email", "whatsapp"], description: "Upcoming rent escalation notice — new amount and date" },
  "lease.notice_acknowledged":         { key: "lease.notice_acknowledged",         channel: "email",    category: "leases",      is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Tenant notice-to-vacate received and acknowledged" },

  // ── Inspection lifecycle extras (BUILD_63) ────────────────────────────────
  "inspection.rescheduled":            { key: "inspection.rescheduled",            channel: "both",     category: "inspections", is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "email"], description: "Inspection rescheduled — new date and time confirmed" },
  "inspection.move_in_report":         { key: "inspection.move_in_report",         channel: "email",    category: "inspections", is_mandatory: true,  tone_profile: "legal",         allowed_channels: ["email"],             description: "Move-in inspection report delivered to tenant — joint inspection record per RHA s5(3)(c) (cannot be unsubscribed)" },

  // ── Maintenance extras (BUILD_63) ─────────────────────────────────────────
  "maintenance.delay":                 { key: "maintenance.delay",                 channel: "both",     category: "maintenance", is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "email"], description: "Maintenance delay notification with revised ETA" },

  // ── Maintenance lifecycle hardening (ADDENDUM_45A) ────────────────────────
  "maintenance.cancelled":             { key: "maintenance.cancelled",             channel: "email",    category: "maintenance", is_mandatory: false, tone_profile: "transactional", allowed_channels: ["whatsapp", "email"], description: "Contractor notified that an active work order has been cancelled (WO token revoked)" },
  "maintenance.cancelled_tenant":      { key: "maintenance.cancelled_tenant",      channel: "email",    category: "maintenance", is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "email"], description: "Tenant notified that the maintenance request they logged has been cancelled" },
  "maintenance.contractor_changed":    { key: "maintenance.contractor_changed",    channel: "email",    category: "maintenance", is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Old contractor notified that the work order has been reassigned to another contractor (WO token revoked)" },
  "maintenance.memo_landlord_notified":{ key: "maintenance.memo_landlord_notified",channel: "email",    category: "maintenance", is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Landlord notified that an agent added a memo to a maintenance request and chose to share it" },

  // ── Portal lifecycle extras (BUILD_63) ────────────────────────────────────
  "portal.invite_reminder":            { key: "portal.invite_reminder",            channel: "sms",      category: "portal",      is_mandatory: false, tone_profile: "relational",    allowed_channels: ["whatsapp", "sms"],  description: "Portal activation reminder — invite still unaccepted at T+7" },
  "portal.access_revoked":             { key: "portal.access_revoked",             channel: "email",    category: "portal",      is_mandatory: false, tone_profile: "transactional", allowed_channels: ["email"],             description: "Portal access revoked — lease ended or manually removed" },

  // ── Delivery fallback (BUILD_63 §7.2) ─────────────────────────────────────
  "notice.delivery_fallback":          { key: "notice.delivery_fallback",          channel: "sms",      category: "notices",     is_mandatory: false, tone_profile: "transactional", allowed_channels: ["whatsapp", "sms"],  description: "Side-channel delivery alert: 'We tried to reach you — view your notice here'" },

  // ── POPIA data-subject request lifecycle (BUILD_65) ───────────────────────
  "popia.request_received":            { key: "popia.request_received",            channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Subject confirmation — POPIA request received with SLA deadline" },
  "popia.request_under_review":        { key: "popia.request_under_review",        channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Subject notified after identity verification — request now under review" },
  "popia.request_approved":            { key: "popia.request_approved",            channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Subject notified of approval for non-export requests (correction, objection, etc.)" },
  "popia.request_rejected":            { key: "popia.request_rejected",            channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Subject notified of rejection with s24 legal basis and IR escalation path" },
  "popia.nuke_confirmation":           { key: "popia.nuke_confirmation",           channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Full erasure completion — summary of deleted, anonymised, and retained records" },
  "popia.export_ready":                { key: "popia.export_ready",                channel: "email", category: "popia", is_mandatory: true,  tone_profile: "legal", allowed_channels: ["email"], description: "Data export bundle ready — signed download URL with 7-day TTL and manifest hash" },
  "popia.policy_update":               { key: "popia.policy_update",               channel: "email", category: "popia", is_mandatory: false, tone_profile: "legal", allowed_channels: ["email"], description: "Material privacy policy change notification with diff link" },
}

/** Returns the template entry or throws if the key is unknown */
export function getTemplate(key: string): TemplateEntry {
  const entry = TEMPLATE_REGISTRY[key]
  if (!entry) throw new Error(`Unknown template key: ${key}`)
  return entry
}
