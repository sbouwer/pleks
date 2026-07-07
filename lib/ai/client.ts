/**
 * lib/ai/client.ts — Unified Anthropic wrapper with automatic AI usage logging
 *
 * Auth:   Server-only — never import in client components
 * Data:   ai_usage (append-only, service role)
 * Notes:  ONLY file permitted to import @anthropic-ai/sdk — enforced by ESLint no-restricted-imports.
 *         Logging is fire-and-forget; failures go to Sentry and never surface to the caller.
 *         Callers MUST pass { orgId, purpose } — these are required for cost attribution.
 *         Set suppressLogging/harnessMode to suppress ai_usage writes — harness use only.
 */
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages"
import { calculateAiCostCents } from "@/lib/observability/cost"
import * as Sentry from "@sentry/nextjs"

export type AiPurpose =
  | "maintenance_triage"
  | "municipal_bill_extraction"
  | "inspection_assessment"
  | "welcome_pack_landlord"
  | "welcome_pack_tenant"
  | "lease_clause_reformat"
  | "property_rules_reformat"
  | "arrears_comms"
  | "applicant_income_extraction"
  | "fitscore_reasoning"
  | "lease_drafting"
  | "tribunal_submission"
  | "deposit_justification"
  | "recon_matching"
  | "document_detection"
  | "warranty_match"
  | "popia_export_narrative"
  | "document_type_classification"
  | "document_extraction"
  | "document_reconciliation"
  | "other"

export interface AiCallOptions {
  orgId: string | null  // null only for platform-level calls (no org context)
  userId?: string | null
  purpose: AiPurpose
  metadata?: Record<string, unknown>  // NO PII — enforced by reviewer
  suppressLogging?: boolean           // harness use only — suppresses ai_usage write
  harnessMode?: boolean               // harness use only — also suppresses ai_usage write
}

export interface AiCallUsage {
  input_tokens: number
  output_tokens: number
  cost_cents: number
}

/**
 * The `content` field of a message param (string | ContentBlockParam[]), re-exported from the SDK type so callers
 * (e.g. the extractors, which are ESLint-barred from importing @anthropic-ai/sdk directly) can precisely type a
 * mixed text+media content array instead of casting through `any`.
 */
export type MessageContent = MessageCreateParamsNonStreaming["messages"][number]["content"]

/**
 * Create an Anthropic message and log usage to ai_usage.
 * Returns the raw Message + metrics. Caller parses the content.
 * Re-throws on error after logging the failure — callers handle fallback.
 */
export async function createMessage(
  params: MessageCreateParamsNonStreaming,
  opts: AiCallOptions,
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured — AI wrapper unavailable")
  }

  const start = Date.now()
  const skipLogging = opts.suppressLogging === true || opts.harnessMode === true
  let errorCode: string | null = null
  let inputTokens  = 0
  let outputTokens = 0
  let cacheReadTokens  = 0
  let cacheWriteTokens = 0

  try {
    // Lazy-import keeps edge bundle small when wrapper is imported but not called
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()
    const message = await client.messages.create(params)

    inputTokens  = message.usage?.input_tokens  ?? 0
    outputTokens = message.usage?.output_tokens ?? 0
    cacheReadTokens  = (message.usage as unknown as Record<string, number>).cache_read_input_tokens    ?? 0
    cacheWriteTokens = (message.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0

    const latency_ms = Date.now() - start
    const cost_cents = calculateAiCostCents({
      model:              params.model,
      input_tokens:       inputTokens,
      output_tokens:      outputTokens,
      cache_read_tokens:  cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
    })

    if (!skipLogging) {
      void logAiUsage({
        org_id:             opts.orgId,
        user_id:            opts.userId ?? null,
        purpose:            opts.purpose,
        model:              params.model,
        input_tokens:       inputTokens,
        output_tokens:      outputTokens,
        cache_read_tokens:  cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        cost_cents,
        latency_ms,
        success: true,
        error_code:         null,
        metadata:           opts.metadata ?? {},
      }).catch(err => {
        Sentry.captureException(err, { tags: { origin: "ai_usage_log" } })
      })
    }

    return { message, usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_cents }, latency_ms }
  } catch (err) {
    errorCode = classifyError(err)
    const latency_ms = Date.now() - start

    if (!skipLogging) {
      void logAiUsage({
        org_id:             opts.orgId,
        user_id:            opts.userId ?? null,
        purpose:            opts.purpose,
        model:              params.model,
        input_tokens:       inputTokens,
        output_tokens:      outputTokens,
        cache_read_tokens:  cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        cost_cents:         0,
        latency_ms,
        success: false,
        error_code:         errorCode,
        metadata:           opts.metadata ?? {},
      }).catch(logErr => {
        Sentry.captureException(logErr, { tags: { origin: "ai_usage_log" } })
      })
    }

    throw err
  }
}

async function logAiUsage(row: {
  org_id:             string | null
  user_id:            string | null
  purpose:            string
  model:              string
  input_tokens:       number
  output_tokens:      number
  cache_read_tokens:  number
  cache_write_tokens: number
  cost_cents:         number
  latency_ms:         number
  success:            boolean
  error_code:         string | null
  metadata:           Record<string, unknown>
}): Promise<void> {
  // Dynamic import keeps next/headers out of the module graph when suppressLogging is true
  const { createServiceClient } = await import("@/lib/supabase/server")
  const db = await createServiceClient()
  const { error } = await db.from("ai_usage").insert(row)
  if (error) throw error
}

function classifyError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  if (msg.includes("timeout") || msg.includes("timed out"))            return "timeout"
  if (msg.includes("rate") || msg.includes("429"))                     return "rate_limit"
  if (msg.includes("invalid") && msg.includes("json"))                 return "invalid_response"
  if (msg.includes("overloaded") || msg.includes("503"))               return "overloaded"
  return "api_error"
}
