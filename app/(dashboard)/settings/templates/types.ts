/**
 * app/(dashboard)/settings/templates/types.ts — shared types for the Templates manager
 *
 * Notes:  DocumentTemplate mirrors the document_templates row loaded in page.tsx. LetterheadBranding is
 *         the org's real branding (from getReportBranding + ppra_ffc_number) rendered in the A4 preview.
 */

export type CommsClass = "service" | "correspondence" | "statutory"

export interface DocumentTemplate {
  id: string
  scope: "system" | "organisation"
  template_type: "letter" | "email" | "whatsapp"
  name: string
  description: string | null
  category: string
  body_html: string | null
  subject: string | null
  whatsapp_body: string | null
  body_variants: Record<string, string> | null
  legal_flag: "wet_ink_only" | "aes_recommended" | null
  merge_fields: string[] | null
  usage_count: number
  last_used_at: string | null
  is_deletable: boolean
  created_at: string
  /** SSOT class (BUILD_70): service = view+flavour; correspondence = editable+signed; statutory = Pleks-master, locked (Phase 3 signing). */
  comms_class: CommsClass | null
  /** Org "Customise" copies link back to the system master so only one version shows. */
  customised_from: string | null
}

/** Agent's active stored signature (full), injected into the correspondence preview/send. */
export interface AgentSignature {
  signedUrl: string | null
}

/** Real org branding for the letterhead preview (no PII; trust signals only). */
export interface LetterheadBranding {
  orgName: string
  logoUrl: string | null
  ffcNumber: string | null
  address: string | null
  accentColor: string
}

/** Merge-field catalogue (mirrors the real {{token}} set resolved at send). label = chip text; sample =
 *  what's shown when "Merge fields" is toggled off (a preview of the filled-in value). */
export const MERGE_FIELDS = [
  { token: "{{tenant.full_name}}", label: "Tenant name", sample: "Jane Smith" },
  { token: "{{unit.number}}", label: "Unit", sample: "12" },
  { token: "{{property.name}}", label: "Property", sample: "Sunview Estate" },
  { token: "{{lease.rent_amount}}", label: "Rent amount", sample: "R 12 500" },
  { token: "{{arrears.total}}", label: "Arrears total", sample: "R 12 500" },
  { token: "{{today}}", label: "Today", sample: "03 Jun 2026" },
  { token: "{{agent.name}}", label: "Agent name", sample: "Stéan Botha" },
] as const

/** The three pre-written tone variants on system templates. */
export const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "firm", label: "Firm" },
] as const

export type ToneId = (typeof TONES)[number]["id"]
