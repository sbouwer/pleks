/**
 * lib/legal/retention-categories.ts — Data retention schedule definitions
 *
 * Notes:  Single source of truth for all retention categories in the privacy policy §08.
 *         Spec: ADDENDUM_00J §4.3
 */

export interface RetentionCategory {
  category: string
  subLabel: string          // may be empty string
  retention: string         // e.g. '30 days after expiry'
  retentionYearsMin: number // for sorting; estimate (30d/365 ≈ 0.082, etc.)
  basis: string             // e.g. 'POPIA s14 — operational necessity'
}

export const RETENTION_CATEGORIES: readonly RetentionCategory[] = [
  {
    category: "Sessions",
    subLabel: "authenticated sessions",
    retention: "30 days after expiry",
    retentionYearsMin: 30 / 365,
    basis: "Operational",
  },
  {
    category: "Authentication events & MFA records",
    subLabel: "login events, passkey, TOTP",
    retention: "7 years",
    retentionYearsMin: 7,
    basis: "POPIA s17 — documentation / accountability",
  },
  {
    category: "Error events",
    subLabel: "PII-scrubbed at Sentry",
    retention: "90 days",
    retentionYearsMin: 90 / 365,
    basis: "Operator default",
  },
  {
    category: "Marketing waitlist",
    subLabel: "opt-in email registrations",
    retention: "Until account creation, or 12 months",
    retentionYearsMin: 1,
    basis: "POPIA s14 — purpose specification",
  },
  {
    category: "Platform billing records",
    subLabel: "subscription charges",
    retention: "5 years from most recent charge",
    retentionYearsMin: 5,
    basis: "Tax Administration Act s29",
  },
  {
    category: "Platform operational data",
    subLabel: "after cancellation — properties, leases, tenants, documents",
    retention: "12 months from cancellation date",
    retentionYearsMin: 1,
    basis: "Contractual — ToS §04; POPIA s11(1)(b) (performance of contract — customer's right to reactivate during the grace period) plus s11(1)(f) (legitimate interest in customer recovery)",
  },
  {
    category: "Support correspondence",
    subLabel: "emails, tickets",
    retention: "3 years from most recent message",
    retentionYearsMin: 3,
    basis: "Operational",
  },
  {
    category: "Audit log",
    subLabel: "all state changes on the platform",
    retention: "7 years",
    retentionYearsMin: 7,
    basis: "POPIA s17 · PPRA audit timelines",
  },
  {
    category: "Rental applications — successful",
    subLabel: "accepted applicants",
    retention: "Absorbed into lease retention",
    retentionYearsMin: 5,
    basis: "Lease retention rules",
  },
  {
    category: "Rental applications — declined or withdrawn (raw screening data)",
    subLabel: "automatic purge — identity documents, bank statements, income records, the credit bureau report, contact details, and the AI-generated narrative",
    retention: "90 days from the terminal decision",
    retentionYearsMin: 90 / 365,
    basis: "POPIA s14 — no longer than necessary. Active legal holds (complaints, disputes, regulator inquiries, attorney correspondence, tribunal matters, contested data-subject requests, or threatened litigation reasonably anticipated) suspend purge until resolution.",
  },
  {
    category: "Rental applications — decision-accountability record",
    subLabel: "FitScore composite, band, per-dimension components, inputs hash, and engine / interpretation / narrative-prompt versions; the categorical decision-reason and adverse-factor codes; the decision date, stage, deciding-agent identity and capacity; the screening- and criminal-screening-policy versions; and the audit-log entry reference",
    retention: "Up to 5 years from the terminal decision",
    retentionYearsMin: 5,
    basis: "POPIA s14(1)(b) — accountability and the establishment, exercise or defence of legal rights (PEPUDA / Rental Housing Act / NCA adverse-action evidentiary record). Active legal hold suspends purge.",
  },
  {
    category: "Credit check results",
    subLabel: "declined / withdrawn applications — raw bureau report purged with the screening package; only the structural scoring outputs survive in the decision-accountability record above",
    retention: "90 days (raw bureau report); scoring outputs up to 5 years",
    retentionYearsMin: 90 / 365,
    basis: "POPIA s14 · Credit Bureau Code of Conduct. The licensed bureau's own intermediary records are governed separately by its bureau-industry retention obligations.",
  },
  {
    category: "Credit check results",
    subLabel: "active lease records",
    retention: "5 years post-termination",
    retentionYearsMin: 5,
    basis: "Prescription Act · PPA s54",
  },
  {
    category: "Consent log",
    subLabel: "timestamp, IP, consent version, purpose",
    retention: "10 years",
    retentionYearsMin: 10,
    basis: "POPIA s17 — documentation / accountability",
  },
  {
    category: "Lease records",
    subLabel: "after lease end",
    retention: "5 years post-termination",
    retentionYearsMin: 5,
    basis: "Prescription Act · PPA s54 + Reg 33",
  },
  {
    category: "Trust account records",
    subLabel: "from end of financial year",
    retention: "5 years",
    retentionYearsMin: 5,
    basis: "PPA Reg 33 · Tax Administration Act s29",
  },
  {
    category: "Deposit records",
    subLabel: "after lease end",
    retention: "5 years post-termination",
    retentionYearsMin: 5,
    basis: "RHA s5 · PPA Reg 33",
  },
  {
    category: "Inspection records & photos",
    subLabel: "Tribunal evidence preservation",
    retention: "3 years post-termination; extended to 5 years from final resolution of the dispute, claim, or proceedings where a Tribunal dispute arises",
    retentionYearsMin: 3,
    basis: "Tribunal evidentiary practice",
  },
  {
    category: "Maintenance records",
    subLabel: "after job completion",
    retention: "3 years post-completion",
    retentionYearsMin: 3,
    basis: "Tribunal evidentiary practice",
  },
  {
    category: "Tenant communications",
    subLabel: "mandatory + operational — full body retained",
    retention: "5 years post-termination",
    retentionYearsMin: 5,
    basis: "RHA · Tax Administration Act s29",
  },
  {
    category: "Owner statements",
    subLabel: "financial reporting to landlords",
    retention: "5 years from statement date",
    retentionYearsMin: 5,
    basis: "Tax Administration Act s29",
  },
  {
    category: "Supplier records",
    subLabel: "contractors, maintenance suppliers",
    retention: "5 years from last engagement",
    retentionYearsMin: 5,
    basis: "Tax Administration Act s29",
  },
  {
    category: "FICA / KYC documentation",
    subLabel: "post-termination of business relationship",
    retention: "5 years",
    retentionYearsMin: 5,
    basis: "FICA s23",
  },
  {
    category: "HOA / scheme records",
    subLabel: "AGM and scheme records",
    retention: "5 years; AGM records per scheme bylaws",
    retentionYearsMin: 5,
    basis: "STSMA · Tax Administration Act s29",
  },
  {
    category: "Subject-request records",
    subLabel: "POPIA rights requests and responses",
    retention: "10 years",
    retentionYearsMin: 10,
    basis: "POPIA s17 — accountability",
  },
  {
    category: "Companies Act accounting records",
    subLabel: "Pleks own records",
    retention: "7 years",
    retentionYearsMin: 7,
    basis: "Companies Act s24",
  },
] as const
