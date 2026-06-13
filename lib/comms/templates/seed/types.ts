/**
 * lib/comms/templates/seed/types.ts — centralized template seed definition (ADDENDUM_70E E3 / 70F)
 *
 * Data:   the typed, single-source representation of every external comm — corrected (70B F-1) +
 *         standardized (70F). The generator (scripts/gen-template-seed.mts) is the ONLY path to both
 *         the human-readable review doc (for CD) and the seed SQL (for the document_templates store).
 * Notes:  SSOT discipline (per Stéan): this module is the source ONLY until the document_templates
 *         store exists (70E E3). Once seeded, the store is SSOT and this becomes the seed/migration
 *         input — not a parallel source to keep editing. Type-checked against the 70E block model so
 *         citations/comms_class/flavours/blocks are validated at compile time (citation-as-data).
 */

import type {
  TemplateBlock,
  TemplateBodyVariants,
  CommsClass,
  TemplateChannel,
} from "../blocks/types"

export interface TemplateSeed {
  /** TEMPLATE_REGISTRY key, e.g. "arrears.final_notice". */
  key: string
  channel: TemplateChannel
  commsClass: CommsClass
  /** document_templates.name (human label). */
  name: string
  description: string
  category: string
  /** Email subject; omit when set at the call-site. */
  subject?: string
  mergeFields?: string[]
  /** Provenance — the 70C/70D section the body was folded from. */
  legalReviewRef?: string
  /**
   * Statutory issuing-basis line rendered by the legalFooterSlot (citation-as-data, legalCitations.ts).
   * The substantive in-body citation lives in a cpaConditional/paragraph block; this is the footer line.
   */
  issuedUnder?: string
  /** Merge fields carrying agent free-text that MUST be validated/structured before render — never
   *  rendered raw into a legal determination (R3 / O-16): e.g. {{legalBasis}}, {{memoText}}, {{prompt}}. */
  validateFields?: string[]
  /** Non-editable + non-flavoured (statutory-grade governance) even though commsClass is correspondence —
   *  POPIA-lifecycle legal-process notices (IR escalation / SLA): locked like statutory, not customisable. */
  locked?: boolean
  /** Single body — statutory + unflavoured templates (statutory is NEVER flavoured, 70F §4). */
  body?: TemplateBlock[]
  /** Flavour-keyed bodies — service/correspondence (70E D4). */
  variants?: TemplateBodyVariants
}

export type TemplateSeedList = readonly TemplateSeed[]
