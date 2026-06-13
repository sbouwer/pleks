/**
 * lib/comms/templates/blocks/types.ts — central template content model (ADDENDUM_70E)
 *
 * Data:   the structured-block representation of a communication body — the new SSOT for
 *         comm CONTENT. Stored in document_templates.body_blocks / body_variants (jsonb).
 * Notes:  ADDENDUM_70E D1/D2/D4. Content is data (these blocks); presentation is code
 *         (the channel renderers + EmailLayout shell). Paragraph/signoff text supports
 *         **bold** inline emphasis and {{merge.tokens}} resolved at render time. One body
 *         renders to email/letter/whatsapp/sms — channel renderers know how to draw each block.
 */

export type TemplateFlavour = "friendly" | "professional" | "firm"
export type TemplateChannel = "email" | "letter" | "whatsapp" | "sms"
export type CommsClass = "service" | "correspondence" | "statutory"

/** "Dear {{tenantName}}," — opening line. */
export interface SalutationBlock { type: "salutation"; text: string }
/** The bold body heading (h1). */
export interface HeadingBlock { type: "heading"; text: string }
/** A paragraph. Supports **bold** emphasis + {{tokens}}. */
export interface ParagraphBlock { type: "paragraph"; text: string }
/** A bulleted/numbered list. Each item supports **bold** + {{tokens}}. */
export interface ListBlock { type: "list"; items: string[]; ordered?: boolean }
/** One label/value pair inside a data box (the grey key/value panel). */
export interface DataRow { label: string; value: string }
/** The grey key/value box (receipts, references, lease facts). */
export interface DataBoxBlock { type: "dataBox"; rows: DataRow[] }
/** A highlighted callout — info (neutral) or warn (the ⚠ urgent banner). */
export interface CalloutBlock { type: "callout"; tone: "info" | "warn"; text: string }
/** A call-to-action button. href may itself be a {{token}}. */
export interface CtaBlock { type: "cta"; label: string; href: string }
/** A horizontal rule. */
export interface DividerBlock { type: "divider" }
/** Sign-off, e.g. "Kind regards,\n{{senderName}}". */
export interface SignoffBlock { type: "signoff"; text: string }
/** Slot where the agent signature is injected (correspondence only). */
export interface SignatureSlotBlock { type: "signatureSlot" }
/** Slot where the shared LegalFooter (ECTA + citations) is injected (statutory only). */
export interface LegalFooterSlotBlock { type: "legalFooterSlot" }
/**
 * A citation/sentence that branches on lease CPA applicability at render time
 * (the runtime branch BUILD_70/F-1 requires — final-notice, expiry-reminder).
 */
export interface CpaConditionalBlock { type: "cpaConditional"; ifCpa: string; otherwise: string }

export type TemplateBlock =
  | SalutationBlock
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | DataBoxBlock
  | CalloutBlock
  | CtaBlock
  | DividerBlock
  | SignoffBlock
  | SignatureSlotBlock
  | LegalFooterSlotBlock
  | CpaConditionalBlock

/** Flavour-keyed bodies. Absent for statutory (legally-fixed wording is never flavoured). */
export interface TemplateBodyVariants {
  friendly?: TemplateBlock[]
  professional?: TemplateBlock[]
  firm?: TemplateBlock[]
}

/** Merge context: {{token}} → value. Same convention as resolveMergeFields. */
export type MergeContext = Record<string, string>

/** Render-time options the renderer/resolver thread through for slot blocks + CPA branch. */
export interface RenderContext {
  merge: MergeContext
  /** Drives cpaConditional; from the lease's cpa_applies_at_signing snapshot. */
  cpaApplies?: boolean
}

/** A resolved template ready to render: blocks + provenance + class. */
export interface ResolvedTemplate {
  blocks: TemplateBlock[]
  commsClass: CommsClass
  /** "system" = our reviewed master; "custom" = this org's fork (ADDENDUM_70E D3). */
  source: "system" | "custom"
  templateKey: string
  channel: TemplateChannel
  flavour: TemplateFlavour
  subject?: string
}

/**
 * The content-bearing shape of a document_templates row (the columns the central
 * template system reads). Mirrors the DB; other columns exist but the resolver ignores them.
 */
export interface StoredTemplateRow {
  comms_class: CommsClass | null
  template_key: string | null
  template_type: TemplateChannel | string
  subject: string | null
  body_blocks: TemplateBlock[] | null
  body_variants: TemplateBodyVariants | null
}
