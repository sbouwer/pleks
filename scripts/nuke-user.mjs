#!/usr/bin/env node
// scripts/nuke-user.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY: Delete a test user and all their data from Supabase.
//
// Prompts for an email address, shows what will be deleted, asks for
// confirmation, then removes:
//   1. tos_acceptances  (trigger bypassed with session_replication_role=replica)
//   2. consent_log      (no ON DELETE cascade — blocked without manual delete)
//   3. All org-scoped data (retry-on-FK cascade loop — same as purge_org_cascade)
//   4. subscriptions + organisations (if sole org member)
//   5. auth user via admin API (cascades: user_profiles, user_orgs, auth_events)
//
// Credentials (from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL   — JS client base URL
//   SUPABASE_SERVICE_ROLE_KEY  — service-role key for auth admin API
//   SUPABASE_PROJECT_ID        — project ref for Management API SQL
//   SUPABASE_ACCESS_TOKEN      — PAT from dashboard/account/tokens
//
// Usage:
//   node scripts/nuke-user.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createInterface } from "node:readline"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR  = resolve(__dirname, "..")
dotenv.config({ path: resolve(ROOT_DIR, ".env.local") })

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_REF    = process.env.SUPABASE_PROJECT_ID
const ACCESS_TOKEN   = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}
if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN in .env.local")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Management API — runs as postgres (superuser), can bypass triggers ────────
async function runSql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL error: ${text}`)
  return JSON.parse(text)
}

// ── Prompt helper ─────────────────────────────────────────────────────────────
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

// ── Validate UUID (basic format guard) ────────────────────────────────────────
function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const email = await ask("Email to nuke: ")
  if (!email) { console.error("No email provided."); process.exit(1) }

  console.log("\nLooking up user...")

  // Find user by email via Management API (direct auth.users access)
  const rows = await runSql(
    `SELECT id, email, created_at FROM auth.users WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1`
  )
  if (!rows.length) { console.error(`\nUser not found: ${email}`); process.exit(1) }

  const { id: userId, created_at } = rows[0]
  if (!isUuid(userId)) { console.error("Unexpected user ID format."); process.exit(1) }

  console.log(`  ID:      ${userId}`)
  console.log(`  Email:   ${email}`)
  console.log(`  Created: ${created_at}`)

  // Find org membership
  const memberRows = await runSql(
    `SELECT org_id FROM user_orgs WHERE user_id = '${userId}' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`
  )
  const orgId = memberRows[0]?.org_id ?? null

  let isSoleOwner = false
  let orgName = "(none)"

  if (orgId) {
    if (!isUuid(orgId)) { console.error("Unexpected org ID format."); process.exit(1) }

    const countRows  = await runSql(
      `SELECT count(*)::int AS n FROM user_orgs WHERE org_id = '${orgId}' AND deleted_at IS NULL`
    )
    isSoleOwner = countRows[0].n === 1

    const orgRows = await runSql(`SELECT name FROM organisations WHERE id = '${orgId}' LIMIT 1`)
    orgName = orgRows[0]?.name ?? orgId
  }

  console.log(`  Org:     ${orgName}`)
  console.log(`  Sole owner: ${orgId ? isSoleOwner : "N/A"}`)
  if (isSoleOwner) console.log("  >> Org and all org data will be deleted.")

  const confirm = await ask("\nNuke this user? Type YES to confirm: ")
  if (confirm !== "YES") { console.log("Aborted."); process.exit(0) }

  console.log("\nDeleting...")

  // ── Step 1: tos_acceptances (immutable trigger bypassed via session_replication_role) ──
  console.log("  [1/5] tos_acceptances...")
  const tosOrgClause = orgId && isSoleOwner ? `OR org_id = '${orgId}'` : ""
  await runSql(`
    DO $$
    BEGIN
      SET LOCAL session_replication_role = 'replica';
      DELETE FROM tos_acceptances WHERE user_id = '${userId}' ${tosOrgClause};
    END $$;
  `)

  // ── Step 2: consent_log (no ON DELETE CASCADE on user_id FK) ─────────────
  console.log("  [2/5] consent_log...")
  await runSql(`DELETE FROM consent_log WHERE user_id = '${userId}'`)

  // ── Step 3: All org-scoped data (retry-on-FK cascade loop) ───────────────
  if (orgId && isSoleOwner) {
    console.log("  [3/5] org data cascade...")
    await runSql(`
      DO $$
      DECLARE
        v_tables text[];
        v_table  text;
        v_errors int;
        v_prev   int := -1;
      BEGIN
        SELECT array_agg(c.table_name ORDER BY c.table_name)
        INTO   v_tables
        FROM   information_schema.columns c
        WHERE  c.table_schema = 'public'
          AND  c.column_name  = 'org_id'
          AND  c.table_name  NOT IN (
                 'tos_acceptances',
                 'consent_log',
                 'organisations',
                 'subscriptions'
               );

        LOOP
          v_errors := 0;
          FOREACH v_table IN ARRAY COALESCE(v_tables, '{}') LOOP
            BEGIN
              EXECUTE format('DELETE FROM public.%I WHERE org_id = $1', v_table)
                USING '${orgId}'::uuid;
            EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
              v_errors := v_errors + 1;
            END;
          END LOOP;
          EXIT WHEN v_errors = 0 OR v_errors = v_prev;
          v_prev := v_errors;
        END LOOP;
      END $$;
    `)

    console.log("  [4/5] subscriptions + org row...")
    await runSql(`DELETE FROM subscriptions WHERE org_id = '${orgId}'`)
    await runSql(`DELETE FROM organisations  WHERE id     = '${orgId}'`)
  } else {
    console.log("  [3/5] skipped org cascade (not sole owner)")
    console.log("  [4/5] skipped")
  }

  // ── Step 5: Delete auth user (cascades user_profiles, user_orgs, auth_events) ──
  console.log("  [5/5] auth user...")
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
  if (deleteErr) {
    console.error(`\nFailed to delete auth user: ${deleteErr.message}`)
    console.error("Manual cleanup may be needed — user_profiles, user_orgs, auth_events may remain.")
    process.exit(1)
  }

  console.log(`\n✓ ${email} nuked.`)
}

main().catch(err => {
  console.error("\nFatal:", err.message ?? err)
  process.exit(1)
})
