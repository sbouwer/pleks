/**
 * lib/legal/operators.ts — Operator/sub-processor directory
 *
 * Notes:  Single source of truth for all operators listed in the POPIA register §C.
 *         Spec: ADDENDUM_00J §4.2
 */

export interface Operator {
  name: string
  role: string           // one-line description of role
  domicile: string       // e.g. 'South Africa', 'US', 'EU'
  crossBorder: boolean   // true if domicile !== 'South Africa'
  instrument: string     // e.g. 'Terms of Service + DPA with SCCs'
  purposes: string[]     // purpose IDs this operator processes, e.g. ['A1','A2']
}

export const OPERATORS: readonly Operator[] = [
  {
    name: "Supabase",
    role: "Backend-as-a-service — Postgres database, authentication, storage, realtime",
    domicile: "US (regional data residency configurable)",
    crossBorder: true,
    instrument: "Terms of Service + Data Processing Addendum with SCCs. Sub-processor: AWS.",
    purposes: [
      "A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","A11","A12",
      "B1","B2","B3","B4","B5","B6","B7","B8","B9","B10","B11","B12",
      "B13","B14","B15","B16","B17","B18","B19","B20","B21","B22","B23",
      "B24","B25","B26","B27",
    ],
  },
  {
    name: "Anthropic",
    role: "Claude Haiku 4.5, Sonnet 4.6, Opus 4.6 — bounded assistive-only AI processing",
    domicile: "US (San Francisco)",
    crossBorder: true,
    instrument: "Anthropic Commercial Terms + DPA with SCCs + zero-retention Enterprise agreement (no API inputs or outputs retained for training)",
    purposes: ["B22"],
  },
  {
    name: "Sentry",
    role: "Exception tracking for platform defect detection. All events PII-scrubbed before transmission.",
    domicile: "US (San Francisco)",
    crossBorder: true,
    instrument: "Sentry Terms of Service + DPA with SCCs",
    purposes: ["A3"],
  },
  {
    name: "Resend",
    role: "Transactional and marketing email delivery. Suppression list and DKIM/SPF/DMARC enforced.",
    domicile: "US",
    crossBorder: true,
    instrument: "Resend Terms of Service + DPA with SCCs",
    purposes: ["A1","A4","A7","A8","A9","A12","B2","B7","B10","B11","B17","B21","B23"],
  },
  {
    name: "Africa's Talking",
    role: "SMS and WhatsApp Business Platform aggregation for SA mobile networks. Routes WhatsApp through Meta.",
    domicile: "Kenya (Nairobi)",
    crossBorder: true,
    instrument: "Africa's Talking Terms of Service + DPA",
    purposes: ["B2","B11","B15","B16","B17","B18"],
  },
  {
    name: "PayFast",
    role: "Payment processing for application fees and Pleks subscription payments. PCI DSS Level 1 certified.",
    domicile: "South Africa (domestic)",
    crossBorder: false,
    instrument: "PayFast Merchant Agreement. Pleks never sees full card PAN — PayFast is the PCI boundary.",
    purposes: ["B9","B27","A8"],
  },
  {
    name: "DocuSeal",
    role: "Digital signature and document-signing workflow. Self-hosted on Hetzner SA (South African infrastructure) — no cross-border transfer.",
    domicile: "South Africa — Hetzner SA (domestic; no SCCs required)",
    crossBorder: false,
    instrument: "DocuSeal open-source licence. No third-party DPA required — no data leaves Pleks's infrastructure.",
    purposes: ["B6"],
  },
  {
    name: "Meta",
    role: "Upstream WhatsApp Business Platform provider — reached via Africa's Talking. Meta-approved templates for transactional messages only.",
    domicile: "US (California) / Ireland (EU)",
    crossBorder: true,
    instrument: "Meta's terms mediated through Africa's Talking relationship",
    purposes: ["B17"],
  },
  {
    name: "Better Stack",
    role: "Uptime monitoring, heartbeat tracking, and alerting. No PII in probe traffic.",
    domicile: "US (Delaware)",
    crossBorder: true,
    instrument: "Better Stack Terms of Service + DPA with SCCs",
    purposes: ["A5"],
  },
  {
    name: "Vercel",
    role: "Next.js hosting, edge-function invocation, CDN. Hosts the entire Pleks application.",
    domicile: "US (San Francisco), global edge",
    crossBorder: true,
    instrument: "Vercel Terms of Service + DPA with SCCs. Logs are POPIA-scrubbed consistent with observability policy.",
    purposes: [
      "A1","A2","A3","A4","A5","A6","A7","A8","A9","A10","A11","A12",
      "B1","B2","B3","B4","B5","B6","B7","B8","B9","B10","B11","B12",
      "B13","B14","B15","B16","B17","B18","B19","B20","B21","B22","B23",
      "B24","B25","B26","B27",
    ],
  },
  {
    name: "Searchworx",
    role: "Multi-product data intermediary — aggregates TransUnion, Experian, Compuscan, and XDS (credit products); Deeds Office of South Africa (property ownership); CIPC (company and director data); Lightstone (property valuations); Home Affairs (DHA); TPN. Explicit applicant consent required per credit check (B4, B26). Property-intelligence pulls (B27) operate under s11(1)(c)/(f) — no applicant consent required. Lightstone operates as a sub-Operator to Searchworx for the valuation product family.",
    domicile: "South Africa (Johannesburg — domestic)",
    crossBorder: false,
    instrument: "Searchworx Services Agreement + POPIA-compliant DPA. Searchworx is itself bound by NCA, POPIA, and FICA regulatory obligations. Data residency: asserted as SA-domiciled; Pleks is seeking written confirmation from Searchworx that all credit data (including data transiting to underlying bureaus TransUnion, Experian, XDS, Compuscan) remains within SA infrastructure. This entry will be updated on receipt of confirmation. Lightstone POPIA compliance incorporated by reference per POPIA s21(2).",
    purposes: ["B4","B26","B27"],
  },
  {
    name: "Huru",
    role: "Enhanced credit reporting for the Estate bundle — ITC Affordability Index and civil-judgement deep-dive consolidated bureau pull. Operates as a sub-operator within the Searchworx operator chain; Estate bundle applicants only.",
    domicile: "South Africa (domestic)",
    crossBorder: false,
    instrument: "Huru Services Agreement via Searchworx operator chain. SA-domiciled; no cross-border transfer and no separate DPA required from Pleks — relationship is governed through Searchworx.",
    purposes: ["B4"],
  },
  {
    name: "Lightstone",
    role: "Commercial property-data vendor providing Erf Valuation Short — estimated market value, value-band, last-sale data. Accessed exclusively via the Searchworx operator chain; Lightstone does not receive or process Pleks customer personal information directly.",
    domicile: "South Africa (domestic)",
    crossBorder: false,
    instrument: "Lightstone data licence via Searchworx operator chain. Lightstone POPIA compliance posture incorporated by reference into the Pleks/Searchworx commercial agreement per POPIA s21(2). No direct Pleks–Lightstone DPA required — relationship governed through Searchworx.",
    purposes: ["B27"],
  },
  {
    name: "GitHub",
    role: "Source-code hosting. Processes contributor PII (commit author identities) only — no customer personal information.",
    domicile: "US (San Francisco)",
    crossBorder: true,
    instrument: "GitHub Terms of Service. Secret-scanning and Dependabot enabled. No customer data in code.",
    purposes: [],
  },
] as const
