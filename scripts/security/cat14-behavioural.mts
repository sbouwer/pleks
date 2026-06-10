/**
 * scripts/security/cat14-behavioural.mts — Category 14: audit behavioural coverage (ADDENDUM_AUDIT_BEHAVIOURAL_COVERAGE)
 *
 * Run:    tsx scripts/security/cat14-behavioural.mts        (local — reads .env.local)
 *         tsx scripts/security/cat14-behavioural.mts --ci    (CI — reads process.env)
 * Auth:   service-role key (bypasses RLS) — same DB seam as audit.mjs Category 13
 * Notes:  Upgrades audit assurance from integrity → coverage: proves every `behavioural` T1 in
 *         lib/audit/t1Registry.ts actually FIRES a correctly-shaped, PII-sanitised audit_log row (the
 *         F0 silent-no-op class passes Category 13 today). Invokes the LOGIC layer directly past the
 *         gateway against a DISPOSABLE test org (0 audit rows at start → deterministic; hard-purged at
 *         teardown → destructive T1s like erasure are safe to actually exercise). `behavioural_pending`
 *         entries (server-action-only, not yet split) report as WARNINGs — visible debt, not silent.
 *         A behavioural T1 with no row / wrong shape / raw PII → CRITICAL → exit 1 (deployment-blocking).
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { T1_REGISTRY, T1_CONTRACT_IDS, type HarnessCtx } from "@/lib/audit/t1Registry"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const ciMode = process.argv.slice(2).includes("--ci")

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf-8")
    const env: Record<string, string> = {}
    for (const line of raw.split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq === -1) continue
      env[t.slice(0, eq)] = t.slice(eq + 1)
    }
    return env
  } catch {
    return {}
  }
}

const ENV = loadEnv()
const SUPABASE_URL = ciMode ? process.env.SUPABASE_URL : ENV.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = ciMode ? process.env.SUPABASE_SERVICE_ROLE_KEY : ENV.SUPABASE_SERVICE_ROLE_KEY

// Same denylist regex Category 13 uses — matches a RAW pii KEY (the masked key is `account_number_masked`,
// which does NOT match, so a correctly-sanitised row passes and a bypassed one fails).
const RAW_PII = /"(account_number|id_number|password|password_hash|cvv|pin)"\s*:/

let critical = 0
let warnings = 0
const log = (s: string) => process.stdout.write(s + "\n")

async function main() {
  log("\n━━━ Category 14 — Audit behavioural coverage ━━━")
  if (!SUPABASE_URL || !SERVICE_KEY) {
    // CI's static-Supabase subset deliberately runs without secrets — skip-and-pass like audit.mjs does
    // (the job is the static check; behavioural coverage runs locally / in the secret-bearing job).
    if (ciMode) {
      log("skipped: CI secrets absent")
      log("Set CI_SUPABASE_URL + CI_SUPABASE_SERVICE_ROLE_KEY in GitHub secrets to enable behavioural coverage.")
      process.exit(0)
    }
    log("🔴 CRITICAL: SUPABASE_URL / SERVICE_ROLE_KEY not set — cannot run behavioural coverage.")
    process.exit(1)
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const stamp = Date.now()
  const email = `cat14+${stamp}@pleks-test.invalid`

  let orgId = ""
  let userId = ""
  let contactId = ""
  let tenantId = ""

  try {
    // ── Disposable org + user + membership + subject (D-2) ──
    const org = await db.from("organisations").insert({ name: `ZZZ_cat14_${stamp}` }).select("id").single()
    if (org.error || !org.data) throw new Error(`org create failed: ${org.error?.message}`)
    orgId = org.data.id as string

    const created = await db.auth.admin.createUser({ email, password: `Cat14!${stamp}`, email_confirm: true })
    if (created.error || !created.data.user) throw new Error(`auth user create failed: ${created.error?.message}`)
    userId = created.data.user.id

    const mem = await db.from("user_orgs").insert({ user_id: userId, org_id: orgId, role: "owner", is_admin: true })
    if (mem.error) throw new Error(`membership create failed: ${mem.error.message}`)

    const contact = await db.from("contacts")
      .insert({ org_id: orgId, first_name: "Cat14", last_name: "Subject", primary_email: email, entity_type: "individual" })
      .select("id").single()
    if (contact.error || !contact.data) throw new Error(`contact create failed: ${contact.error?.message}`)
    contactId = contact.data.id as string

    const tenant = await db.from("tenants")
      .insert({ org_id: orgId, contact_id: contactId, auth_user_id: userId })
      .select("id").single()
    if (tenant.error || !tenant.data) throw new Error(`tenant create failed: ${tenant.error?.message}`)
    tenantId = tenant.data.id as string

    const ctx: HarnessCtx = { service: db, orgId, userId, contactId, tenantId, subjectEmail: email }

    // ── Drive each T1 ──
    for (const t1 of T1_REGISTRY) {
      if (t1.status === "behavioural_pending") {
        warnings++
        log(`  ⚠️  ${t1.id} — behavioural_pending: ${t1.reason ?? "not yet driveable headless"}`)
        continue
      }
      if (!t1.invoke) { critical++; log(`  🔴 ${t1.id} — behavioural but no invoke()`); continue }

      let recordId = ""
      try {
        ;({ recordId } = await t1.invoke(ctx))
      } catch (err) {
        critical++
        log(`  🔴 ${t1.id} — invoke threw: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
      if (!recordId) { critical++; log(`  🔴 ${t1.id} — invoke returned no recordId`); continue }

      const { data: rows, error } = await db.from("audit_log")
        .select("table_name, action, record_id, old_values, new_values")
        .eq("org_id", orgId).eq("table_name", t1.table).eq("action", t1.expectedAction).eq("record_id", recordId)
      if (error) { critical++; log(`  🔴 ${t1.id} — audit_log read failed: ${error.message}`); continue }

      if (!rows || rows.length === 0) {
        critical++
        log(`  🔴 ${t1.id} — NO audit_log row (${t1.table}/${t1.expectedAction}/${recordId}) — the mutation fired nothing (F0 class)`)
        continue
      }

      const blob = JSON.stringify(rows.map((r) => ({ o: r.old_values, n: r.new_values })))
      if (RAW_PII.test(blob)) {
        critical++
        log(`  🔴 ${t1.id} — audit row contains RAW PII (sanitiser bypassed)`)
        continue
      }
      log(`  ✅ ${t1.id} — fired ${t1.table}/${t1.expectedAction}, PII-sanitised`)
    }

    // ── Registry-completeness (D-6): every contract id has a registry entry ──
    const ids = new Set(T1_REGISTRY.map((t) => t.id))
    const missing = T1_CONTRACT_IDS.filter((id) => !ids.has(id))
    if (missing.length) { critical++; log(`  🔴 registry incomplete — missing T1(s): ${missing.join(", ")}`) }
    else log(`  ✅ registry complete — all ${T1_CONTRACT_IDS.length} contract T1s registered`)
  } finally {
    // ── Hard-purge the disposable org (D-2) — self-discovering so it can't leak ──
    // Try to delete the org; on each FK violation, parse the blocking child table from the PG error,
    // delete its rows by org_id, and retry. Auto-handles trigger-provisioned children (subscriptions,
    // retention_policies_snapshot, …) without hardcoding the ~120 org-referencing tables.
    if (orgId) {
      // Seeded children first, in FK-safe order (tenants + bank reference contacts).
      for (const t of ["contact_bank_accounts", "tenants", "contacts", "user_orgs", "audit_log"]) {
        await db.from(t).delete().eq("org_id", orgId)
      }
      const tried = new Set<string>()
      for (let i = 0; i < 80; i++) {
        const del = await db.from("organisations").delete().eq("id", orgId)
        if (!del.error) break
        const blockers = [...del.error.message.matchAll(/on table "([^"]+)"/g)]
          .map((m) => m[1]).filter((t) => t !== "organisations")
        const blocker = blockers[blockers.length - 1]
        if (!blocker || tried.has(blocker)) {
          log(`  ⚠️  org purge incomplete — blocked by ${blocker ?? "unknown"}: ${del.error.message}`)
          break
        }
        tried.add(blocker)
        await db.from(blocker).delete().eq("org_id", orgId)
      }
    }
    if (userId) await db.auth.admin.deleteUser(userId)
  }

  log(`\nCategory 14: ${critical} critical, ${warnings} pending(warn)`)
  if (critical > 0) {
    log("🔴 Category 14 FAILED — a behavioural T1 did not fire a correctly-shaped, sanitised audit row.")
    process.exit(1)
  }
  log("✅ Category 14 passed — every behavioural T1 fires an audited row.\n")
}

main().catch((err) => {
  log(`🔴 Category 14 crashed: ${err instanceof Error ? err.stack : String(err)}`)
  process.exit(1)
})
