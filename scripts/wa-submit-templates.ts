/**
 * WhatsApp Template Submission Script
 *
 * Submits system WhatsApp templates to Africa's Talking / Meta for approval.
 * Creates 3 tone variants per template: friendly, professional, firm.
 *
 * Usage:
 *   pnpm tsx scripts/wa-submit-templates.ts           # submit pending templates
 *   pnpm tsx scripts/wa-submit-templates.ts --dry-run  # preview without submitting
 *   pnpm tsx scripts/wa-submit-templates.ts --status   # show current approval status
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   WA_API_KEY (or AT_API_KEY), WA_USERNAME (or AT_USERNAME), WA_BUSINESS_PHONE_ID
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

// ── Types ──────────────────────────────────────────────────────────────────────

type Tone = "friendly" | "professional" | "firm"

interface DocumentTemplate {
  id: string
  name: string
  whatsapp_body: string | null
  body_variants: Record<Tone, string> | null
  merge_fields: string[] | null
  meta_template_id: string | null
  meta_template_status: string | null
  whatsapp_meta_variable_map: Record<string, { index: number; merge_field: string }> | null
  whatsapp_meta_submitted_at: string | null
}

interface VariableMap {
  [varName: string]: { index: number; merge_field: string }
}

interface SubmitResult {
  templateName: string
  metaName: string
  tone: Tone
  success: boolean
  metaTemplateId?: string
  error?: string
}

// ── Env helpers ────────────────────────────────────────────────────────────────

function getApiKey(): string {
  return process.env.WA_API_KEY ?? process.env.AT_API_KEY ?? ""
}

function getUsername(): string {
  return process.env.WA_USERNAME ?? process.env.AT_USERNAME ?? ""
}

function isSandbox(): boolean {
  return process.env.WA_SANDBOX === "true" || getUsername() === "sandbox"
}

function getBaseUrl(): string {
  if (isSandbox()) {
    return "https://api.sandbox.africastalking.com/chat/whatsapp/v1"
  }
  return "https://api.africastalking.com/chat/whatsapp/v1"
}

// ── Supabase client ────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local")
  }
  return createClient(url, key)
}

// ── Name/slug helpers ──────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
}

function buildMetaTemplateName(name: string, tone: Tone): string {
  return `pleks_${slugify(name)}_${tone}`
}

// ── Variable map builder ───────────────────────────────────────────────────────

/**
 * Converts named merge fields (e.g. {{tenant.primary_contact_name}}) into
 * positional variables {{1}}, {{2}} etc. and returns:
 *  - the body with positional placeholders
 *  - a variable map: { "1": { index: 1, merge_field: "tenant.primary_contact_name" }, ... }
 */
function buildPositionalBody(body: string, mergeFields: string[]): { positionalBody: string; varMap: VariableMap } {
  const varMap: VariableMap = {}
  let positionalBody = body
  let index = 1

  for (const field of mergeFields) {
    // Match {{field}} pattern
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(escaped, "g")
    if (positionalBody.includes(field)) {
      const varKey = String(index)
      varMap[varKey] = { index, merge_field: field.replace(/^\{\{/, "").replace(/\}\}$/, "") }
      positionalBody = positionalBody.replace(regex, `{{${index}}}`)
      index++
    }
  }

  return { positionalBody, varMap }
}

// ── AT template submission ─────────────────────────────────────────────────────

async function submitTemplateToAT(
  metaName: string,
  body: string,
  category: string,
): Promise<{ success: boolean; metaTemplateId?: string; error?: string }> {
  const apiKey = getApiKey()
  const username = getUsername()
  const phoneId = process.env.WA_BUSINESS_PHONE_ID

  if (!apiKey || !username) {
    return { success: false, error: "Africa's Talking credentials not configured" }
  }
  if (!phoneId) {
    return { success: false, error: "WA_BUSINESS_PHONE_ID not configured" }
  }

  const payload = {
    username,
    phoneNumberId: phoneId,
    name: metaName,
    language: "en",
    category: category.toUpperCase(),
    components: [
      {
        type: "BODY",
        text: body,
      },
    ],
  }

  try {
    const response = await fetch(`${getBaseUrl()}/template`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apiKey,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `AT API ${response.status}: ${text}` }
    }

    const data = (await response.json()) as Record<string, unknown>
    const metaTemplateId = extractTemplateId(data) ?? metaName
    return { success: true, metaTemplateId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Submit failed" }
  }
}

function extractTemplateId(data: Record<string, unknown>): string | undefined {
  if (typeof data.id === "string") return data.id
  if (typeof data.templateId === "string") return data.templateId
  if (typeof data.template_id === "string") return data.template_id
  return undefined
}

// ── Status display ─────────────────────────────────────────────────────────────

async function showStatus(): Promise<void> {
  const db = getSupabase()

  const { data: templates, error } = await db
    .from("document_templates")
    .select("name, meta_template_id, meta_template_status, whatsapp_meta_submitted_at, whatsapp_meta_approved_at, whatsapp_meta_rejection_reason")
    .eq("template_type", "whatsapp")
    .eq("scope", "system")
    .order("name")

  if (error) {
    console.error("Failed to load templates:", error.message)
    process.exit(1)
  }

  if (!templates || templates.length === 0) {
    console.log("No WhatsApp templates found.")
    return
  }

  console.log("\n WhatsApp Template Status\n" + "─".repeat(80))
  for (const t of templates) {
    const status = t.meta_template_status ?? "not submitted"
    const submitted = t.whatsapp_meta_submitted_at
      ? new Date(t.whatsapp_meta_submitted_at).toLocaleDateString()
      : "—"
    const approved = t.whatsapp_meta_approved_at
      ? new Date(t.whatsapp_meta_approved_at).toLocaleDateString()
      : "—"
    const rejection = t.whatsapp_meta_rejection_reason ?? ""

    console.log(`  ${t.name}`)
    console.log(`    Status:     ${status}`)
    console.log(`    Meta ID:    ${t.meta_template_id ?? "—"}`)
    console.log(`    Submitted:  ${submitted}`)
    console.log(`    Approved:   ${approved}`)
    if (rejection) console.log(`    Rejection:  ${rejection}`)
    console.log()
  }
}

// ── Main submission flow ───────────────────────────────────────────────────────

async function run(): Promise<void> {
  const args = process.argv.slice(2)
  const isDryRun = args.includes("--dry-run")
  const isStatus = args.includes("--status")

  if (isStatus) {
    await showStatus()
    return
  }

  const db = getSupabase()

  // Load all system WhatsApp templates
  const { data: templates, error: loadErr } = await db
    .from("document_templates")
    .select("id, name, whatsapp_body, body_variants, merge_fields, meta_template_id, meta_template_status, whatsapp_meta_variable_map, whatsapp_meta_submitted_at")
    .eq("template_type", "whatsapp")
    .eq("scope", "system")
    .order("name")

  if (loadErr) {
    console.error("Failed to load templates:", loadErr.message)
    process.exit(1)
  }

  if (!templates || templates.length === 0) {
    console.log("No system WhatsApp templates found.")
    return
  }

  const tones: Tone[] = ["friendly", "professional", "firm"]
  const results: SubmitResult[] = []

  console.log(`\n WhatsApp Template Submission${isDryRun ? " (DRY RUN)" : ""}\n` + "─".repeat(80))

  for (const template of templates as DocumentTemplate[]) {
    const variants = template.body_variants
    const mergeFields = template.merge_fields ?? []

    for (const tone of tones) {
      const body = resolveBody(template, variants, tone)
      if (!body) {
        console.warn(`  SKIP ${template.name} [${tone}] — no body`)
        continue
      }

      const metaName = buildMetaTemplateName(template.name, tone)
      const { positionalBody, varMap } = buildPositionalBody(body, mergeFields)

      console.log(`  ${isDryRun ? "WOULD SUBMIT" : "Submitting"}: ${metaName}`)
      if (isDryRun) {
        console.log(`    Body: ${positionalBody.slice(0, 80)}${positionalBody.length > 80 ? "..." : ""}`)
        console.log(`    Variables: ${JSON.stringify(varMap)}`)
        results.push({ templateName: template.name, metaName, tone, success: true })
        continue
      }

      const submitResult = await submitTemplateToAT(metaName, positionalBody, "UTILITY")

      if (submitResult.success) {
        console.log(`    OK — Meta ID: ${submitResult.metaTemplateId}`)

        // Store result in document_templates
        const { error: updateErr } = await db
          .from("document_templates")
          .update({
            meta_template_id: submitResult.metaTemplateId ?? metaName,
            meta_template_status: "pending",
            whatsapp_meta_submitted_at: new Date().toISOString(),
            whatsapp_meta_variable_map: varMap,
            whatsapp_meta_category: "utility",
          })
          .eq("id", template.id)

        if (updateErr) {
          console.error(`    DB update error: ${updateErr.message}`)
        }
      } else {
        console.error(`    FAILED: ${submitResult.error}`)
      }

      results.push({
        templateName: template.name,
        metaName,
        tone,
        success: submitResult.success,
        metaTemplateId: submitResult.metaTemplateId,
        error: submitResult.error,
      })

      // Brief pause between submissions to avoid rate limiting
      await sleep(300)
    }
  }

  // Summary
  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length
  console.log(`\n Summary: ${succeeded} submitted, ${failed} failed out of ${results.length} total`)
}

function resolveBody(
  template: DocumentTemplate,
  variants: Record<Tone, string> | null,
  tone: Tone,
): string | null {
  if (variants && variants[tone]) return variants[tone]
  return template.whatsapp_body ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Entry point ────────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
