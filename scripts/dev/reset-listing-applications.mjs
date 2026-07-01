#!/usr/bin/env node
/**
 * scripts/dev/reset-listing-applications.mjs — DEV/TEST ONLY: wipe all APPLICATION data for a listing.
 *
 * Clears every application on a listing (and, by FK CASCADE, all its children: co-applicants, tokens, screening
 * jobs/evaluations/lines/payments, documents, prescreens, directors, guarantors, consent_verifications, artifacts),
 * PLUS the uploaded docs in Storage, PLUS the tenants/contacts/auth accounts that account-at-completion (14R) creates
 * from them — so every apply flow can be re-tested from a clean slate. The LISTING row itself is kept.
 *
 * Usage:  node scripts/dev/reset-listing-applications.mjs [listing-public-slug] [--keep-accounts]
 *           • slug defaults to the 27-twin-peaks test listing.
 *           • --keep-accounts leaves the tenants/contacts/auth users (re-tests then reuse the existing account).
 *
 * SAFETY: uses the SERVICE ROLE key and hard-deletes rows — only ever point it at a TEST listing.
 */
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, "../../.env.local") })

const args = process.argv.slice(2)
const SLUG = args.find((a) => !a.startsWith("--")) ?? "27-twin-peaks-section-5d55"
const KEEP_ACCOUNTS = args.includes("--keep-accounts")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const uniq = (xs) => [...new Set(xs.filter(Boolean))]

async function removePrefix(bucket, prefix) {
  const { data: entries, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !entries?.length) return 0
  let removed = 0
  const files = []
  for (const e of entries) {
    if (e.id === null) removed += await removePrefix(bucket, `${prefix}/${e.name}`) // a sub-folder
    else files.push(`${prefix}/${e.name}`)
  }
  if (files.length) { await db.storage.from(bucket).remove(files); removed += files.length }
  return removed
}

async function main() {
  const { data: listing, error: le } = await db.from("listings").select("id, org_id").eq("public_slug", SLUG).maybeSingle()
  if (le) throw le
  if (!listing) { console.error(`✗ No listing with public_slug="${SLUG}"`); process.exit(1) }
  console.log(`Listing "${SLUG}" → id=${listing.id}`)

  const { data: apps, error: ae } = await db.from("applications").select("id, tenant_id").eq("listing_id", listing.id)
  if (ae) throw ae
  const appIds = (apps ?? []).map((a) => a.id)
  if (!appIds.length) { console.log("Nothing to clear — no applications on this listing."); return }
  console.log(`Applications to clear: ${appIds.length}`)

  const { data: cos } = await db.from("application_co_applicants").select("tenant_id").in("primary_application_id", appIds)
  const tenantIds = uniq([...(apps ?? []), ...(cos ?? [])].map((r) => r.tenant_id))

  // 1. Storage (uploaded docs live under application-docs/{org}/{appId}/…).
  let storageRemoved = 0
  for (const appId of appIds) storageRemoved += await removePrefix("application-docs", `${listing.org_id}/${appId}`)

  // 2. Consent-log rows for these apps (jsonb metadata.application_id) — best-effort (test audit rows).
  for (const appId of appIds) {
    try { await db.from("consent_log").delete().filter("metadata->>application_id", "eq", appId) } catch { /* ignore */ }
  }

  // 3. Applications → CASCADES all application children.
  const { error: de } = await db.from("applications").delete().eq("listing_id", listing.id)
  if (de) throw de

  // 4. Derived tenants / contacts / auth accounts (so account-at-completion re-tests fresh).
  let tCount = 0, cCount = 0, uCount = 0
  if (!KEEP_ACCOUNTS && tenantIds.length) {
    const { data: tens } = await db.from("tenants").select("id, contact_id, auth_user_id").in("id", tenantIds)
    const contactIds = uniq((tens ?? []).map((t) => t.contact_id))
    const authUserIds = uniq((tens ?? []).map((t) => t.auth_user_id))
    await db.from("tenants").delete().in("id", tenantIds); tCount = tenantIds.length
    if (contactIds.length) { await db.from("contacts").delete().in("id", contactIds); cCount = contactIds.length }
    for (const uid of authUserIds) {
      const { error } = await db.auth.admin.deleteUser(uid)
      if (error) console.log(`  (auth user ${uid} not deleted: ${error.message})`); else uCount++
    }
  }

  console.log(`✓ Cleared: ${appIds.length} application(s) + cascaded children, ${storageRemoved} storage file(s), ` +
    (KEEP_ACCOUNTS ? `${tenantIds.length} tenant(s)/account(s) KEPT.` : `${tCount} tenant(s), ${cCount} contact(s), ${uCount} auth account(s).`))
  console.log("Done — the listing is ready for a fresh test run.")
}

main().catch((e) => { console.error("✗ Reset failed:", e?.message ?? e); process.exit(1) })
