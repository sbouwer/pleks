/**
 * lib/comms/templates/resolveTemplate.ts — central template resolver (ADDENDUM_70E D3/D4)
 *
 * Data:   document_templates (body_blocks / body_variants / comms_class / template_key)
 * Auth:   pass any gateway-scoped client; reads only. Statutory floor enforced here, not by the caller.
 * Notes:  The single body source for the new central template system. Resolution order:
 *           1. org CUSTOM fork (scope=organisation, matching template_key + channel) — if present
 *           2. else SYSTEM master (scope=system)
 *         Flavour: a non-statutory template uses body_variants[flavour] when present, else body_blocks.
 *         STATUTORY IS NEVER FLAVOURED (legal correctness > tone) — always its base body_blocks.
 *         Returns null when neither layer exists (caller falls back to the legacy React-Email path).
 *         This generalises the BUILD_70 Phase-2b override (orgTemplateOverride) into THE resolver.
 */

import type {
  ResolvedTemplate,
  StoredTemplateRow,
  TemplateBlock,
  TemplateChannel,
  TemplateFlavour,
  CommsClass,
} from "./blocks/types"

// Minimal shape we need from the Supabase client — keeps this testable without the full type.
interface TemplateQueryBuilder {
  eq: (col: string, val: unknown) => TemplateQueryBuilder
  maybeSingle: () => Promise<{ data: StoredTemplateRow | null; error: unknown }>
}
export interface TemplateQueryClient {
  from: (table: string) => { select: (cols: string) => TemplateQueryBuilder }
}

const CONTENT_COLS =
  "comms_class, template_key, template_type, subject, body_blocks, body_variants"

export interface ResolveTemplateParams {
  templateKey: string
  channel: TemplateChannel
  orgId: string
  flavour?: TemplateFlavour
}

/** Pick the blocks for a flavour, honouring the statutory-never-flavoured floor. */
export function pickBlocks(
  row: Pick<StoredTemplateRow, "comms_class" | "body_blocks" | "body_variants">,
  flavour: TemplateFlavour,
): TemplateBlock[] | null {
  const isStatutory = row.comms_class === "statutory"
  if (!isStatutory && row.body_variants) {
    const variant = row.body_variants[flavour]
    if (variant && variant.length > 0) return variant
  }
  return row.body_blocks && row.body_blocks.length > 0 ? row.body_blocks : null
}

// Fetch one content row by scope + key + channel. Returns null on miss or query error (fail-safe
// to the legacy path — never throw the send).
async function fetchRow(
  db: TemplateQueryClient,
  scope: "system" | "organisation",
  orgId: string | null,
  templateKey: string,
  channel: TemplateChannel,
): Promise<StoredTemplateRow | null> {
  let q = db
    .from("document_templates")
    .select(CONTENT_COLS)
    .eq("template_key", templateKey)
    .eq("template_type", channel)
    .eq("scope", scope)
  if (scope === "organisation") q = q.eq("org_id", orgId)

  const { data, error } = await q.maybeSingle()
  if (error || !data) return null
  return data
}

/**
 * Resolve the body for (templateKey, channel) for an org: custom fork ?? system master,
 * flavour-aware, statutory-floor-aware. null = no stored template (use the legacy path).
 */
export async function resolveTemplate(
  db: TemplateQueryClient,
  params: ResolveTemplateParams,
): Promise<ResolvedTemplate | null> {
  const { templateKey, channel, orgId, flavour = "professional" } = params

  const custom = await fetchRow(db, "organisation", orgId, templateKey, channel)
  const row = custom ?? (await fetchRow(db, "system", null, templateKey, channel))
  if (!row) return null

  const blocks = pickBlocks(row, flavour)
  if (!blocks) return null

  return {
    blocks,
    commsClass: (row.comms_class ?? "correspondence") as CommsClass,
    source: custom ? "custom" : "system",
    templateKey,
    channel,
    flavour,
    subject: row.subject ?? undefined,
  }
}
