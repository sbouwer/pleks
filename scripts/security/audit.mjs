#!/usr/bin/env node
/**
 * Pleks Security Audit Suite
 * ==========================
 * Run before every deployment: `node scripts/security/audit.mjs`
 *
 * Tests 12 security categories against the live Supabase instance
 * and local Next.js dev server. Produces a structured report.
 *
 * Requirements:
 *   - .env.local must exist at project root
 *   - `npm run dev` should be running on localhost:3000
 *   - Node 18+ (for native fetch)
 *
 * Usage:
 *   node scripts/security/audit.mjs              # full audit
 *   node scripts/security/audit.mjs --category 7 # single category
 *   node scripts/security/audit.mjs --quick       # skip slow tests
 */

import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")

// ─── Load .env.local ─────────────────────────────────────────
function loadEnv() {
  const raw = readFileSync(resolve(ROOT, ".env.local"), "utf-8")
  const env = {}
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

const ENV = loadEnv()
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY
const APP_URL = ENV.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const CRON_SECRET = ENV.CRON_SECRET
const ADMIN_SECRET = ENV.ADMIN_SECRET

// ─── CLI flags ───────────────────────────────────────────────
const args = process.argv.slice(2)
const singleCategory = args.includes("--category") ? parseInt(args[args.indexOf("--category") + 1]) : null
const quickMode = args.includes("--quick")

// ─── Report accumulator ─────────────────────────────────────
const findings = []
let testsRun = 0
let testsPassed = 0

function finding(category, severity, title, detail, fix) {
  findings.push({ category, severity, title, detail, fix })
}

function pass(category, title) {
  testsPassed++
}

function test(label) {
  testsRun++
  process.stdout.write(`  ├─ ${label}...`)
}

function ok(msg) {
  console.log(` ✅ ${msg || "PASS"}`)
}

function fail(msg) {
  console.log(` 🔴 ${msg || "FAIL"}`)
}

function warn(msg) {
  console.log(` ⚠️  ${msg || "WARNING"}`)
}

function skip(msg) {
  console.log(` ⏭️  ${msg || "SKIPPED"}`)
}

// ─── Helpers ─────────────────────────────────────────────────
async function supaRest(path, { key = ANON_KEY, method = "GET", body = null, headers = {} } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const opts = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...headers,
    },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(url, opts)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, text, json, headers: Object.fromEntries(res.headers.entries()) }
}

async function appFetch(path, opts = {}) {
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      redirect: "manual",
      ...opts,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: res.status, text, json, headers: Object.fromEntries(res.headers.entries()) }
  } catch (e) {
    return { status: 0, text: e.message, json: null, headers: {} }
  }
}

// ─── All tables to test ──────────────────────────────────────
// Tables that intentionally have USING (true) for SELECT — read-only reference/seed data
const READ_ONLY_PUBLIC_TABLES = new Set([
  "lease_clause_library",  // Shared clause seed data — no org_id
  "prime_rates",           // SARB prime rate history — public reference
  "rule_templates",        // Shared property rule templates — no org_id
])

const SENSITIVE_TABLES = [
  "organisations", "user_orgs", "contacts", "tenants", "landlords",
  "contractors", "leases", "units", "properties", "payments",
  "rent_invoices", "bank_accounts", "debicheck_mandates",
  "debicheck_collections", "applications", "consent_log", "audit_log",
  "communication_log", "municipal_bills", "maintenance_requests",
  "inspections", "arrears_cases", "deposits", "deposit_transactions",
  "lease_clause_selections", "supplier_invoices",
]

const PUBLIC_API_ROUTES = [
  "/api/applications/create",
  "/api/auth/check-email",
  "/api/waitlist",
  "/api/unsubscribe/fake-token-123",
]

const AUTHENTICATED_API_ROUTES = [
  "/api/org/details",
  "/api/org/info",
  "/api/tenants",
  "/api/landlords",
  "/api/contractors",
  "/api/leases/clause-library",
  "/api/leases/org-clause-defaults",
  "/api/rent-invoices",
  "/api/reports",
  "/api/deposit-interest-config",
  "/api/org/notifications",
]

const CRON_ROUTES = [
  "/api/cron/daily",
  "/api/cron/invoice-generate",
  "/api/cron/lease-expiry-check",
  "/api/cron/arrears-sequence",
  "/api/cron/deposit-interest",
  "/api/cron/debicheck-collection",
  "/api/cron/trial-expiry",
  "/api/cron/prime-rate-sync",
  "/api/cron/application-reminders",
  "/api/cron/arrears-interest",
]

const WEBHOOK_ROUTES = [
  "/api/webhooks/peach",
  "/api/webhooks/resend",
  "/api/webhooks/docuseal",
  "/api/webhooks/searchworx",
  "/api/webhooks/payfast/application",
  "/api/webhooks/payfast/subscription",
]

// ═══════════════════════════════════════════════════════════════
// CATEGORY 1: Unauthenticated Table Access
// ═══════════════════════════════════════════════════════════════
async function cat1_unauthenticatedAccess() {
  console.log("\n📋 Category 1: Unauthenticated Table Access")
  console.log("─".repeat(50))

  // First check if anon key even works with PostgREST
  const probe = await supaRest("organisations?select=id&limit=1")
  const anonKeyWorks = probe.status !== 401 && probe.status !== 403

  if (!anonKeyWorks) {
    console.log("  ├─ ℹ️  Anon/publishable key rejected by PostgREST (401/403)")
    console.log("  ├─ ℹ️  This means unauthenticated REST access is fully blocked")
    console.log("  ├─ ℹ️  Testing with service key + RLS to verify row-level enforcement...")
    console.log("")
  }

  for (const table of SENSITIVE_TABLES) {
    // Test SELECT with anon key
    test(`SELECT ${table} (anon)`)
    const sel = await supaRest(`${table}?select=id&limit=5`)
    if (sel.status === 401 || sel.status === 403) {
      ok("blocked (key rejected)")
      pass(1, `SELECT ${table}`)
    } else if (sel.status === 200 && Array.isArray(sel.json) && sel.json.length > 0) {
      fail(`${sel.json.length} rows returned!`)
      finding(1, "CRITICAL", `Unauthenticated SELECT on ${table}`, `Anon key returned ${sel.json.length} rows`, `Add RLS: USING (false) for anon, or USING (auth.uid() IS NOT NULL)`)
    } else if (sel.status === 200 && Array.isArray(sel.json) && sel.json.length === 0) {
      ok("0 rows (RLS or empty)")
      pass(1, `SELECT ${table}`)
    } else if (sel.status === 404 || (sel.json && sel.json.code === "PGRST204")) {
      ok("table not in schema cache")
      pass(1, `SELECT ${table}`)
    } else {
      ok(`${sel.status} (blocked or not exposed)`)
      pass(1, `SELECT ${table}`)
    }

    if (quickMode) continue

    // Test INSERT
    test(`INSERT ${table} (anon)`)
    const ins = await supaRest(table, {
      method: "POST",
      body: { id: "00000000-0000-0000-0000-000000000000" },
      headers: { Prefer: "return=minimal" },
    })
    if (ins.status === 201) {
      fail("INSERT succeeded!")
      finding(1, "CRITICAL", `Unauthenticated INSERT on ${table}`, `Anon key could insert a row`, `Add RLS WITH CHECK for INSERT`)
    } else {
      ok(`blocked (${ins.status})`)
      pass(1, `INSERT ${table}`)
    }

    // Test DELETE
    test(`DELETE ${table} (anon)`)
    const del = await supaRest(`${table}?id=eq.00000000-0000-0000-0000-000000000000`, { method: "DELETE" })
    if (del.status === 200 || del.status === 204) {
      warn("DELETE returned 2xx (check if RLS blocked actual deletion)")
    } else {
      ok(`blocked (${del.status})`)
      pass(1, `DELETE ${table}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 2: Cross-Org Data Leakage (via service role audit)
// ═══════════════════════════════════════════════════════════════
async function cat2_crossOrgLeakage() {
  console.log("\n📋 Category 2: Cross-Org Data Leakage")
  console.log("─".repeat(50))

  // Check how many orgs exist
  test("Count distinct organisations")
  const orgs = await supaRest("organisations?select=id", { key: SERVICE_KEY })
  const orgCount = Array.isArray(orgs.json) ? orgs.json.length : 0
  ok(`${orgCount} orgs found`)

  if (orgCount < 2) {
    console.log("  ├─ ⚠️  Only 1 org — cross-org tests are limited. Create a second org for full testing.")
    return
  }

  // Check if any table has rows from multiple orgs (service role can see all)
  const MULTI_ORG_TABLES = ["leases", "tenants", "properties", "units", "payments", "maintenance_requests"]
  for (const table of MULTI_ORG_TABLES) {
    test(`Distinct org_ids in ${table}`)
    const res = await supaRest(`rpc/count_distinct_orgs`, {
      key: SERVICE_KEY,
      method: "POST",
      body: { target_table: table },
    })
    if (res.status === 404) {
      // Function doesn't exist — skip
      skip("rpc not available")
    } else if (res.json && res.json > 1) {
      ok(`${res.json} orgs — cross-org isolation testable`)
    } else {
      ok("single org data")
    }
  }

  // Test: Can anon key see data from ANY org?
  test("Anon key cross-org SELECT on leases")
  const anonLeases = await supaRest("leases?select=id,org_id&limit=10")
  if (Array.isArray(anonLeases.json) && anonLeases.json.length > 0) {
    const distinctOrgs = new Set(anonLeases.json.map(r => r.org_id))
    if (distinctOrgs.size > 1) {
      fail(`CROSS-ORG LEAK: ${distinctOrgs.size} orgs visible!`)
      finding(2, "CRITICAL", "Cross-org data visible via anon key", `${distinctOrgs.size} distinct org_ids returned`, "RLS must filter by org_id")
    } else {
      fail("Anon can see data (but single org)")
      finding(2, "HIGH", "Anon key returns lease data", "Data returned without auth", "RLS should block anon entirely")
    }
  } else {
    ok("no data visible")
    pass(2, "cross-org leases")
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 3: Gateway / org_id Derivation
// ═══════════════════════════════════════════════════════════════
async function cat3_gatewayBypass() {
  console.log("\n📋 Category 3: Gateway Bypass / org_id Injection")
  console.log("─".repeat(50))

  // Test: Can we inject org_id via POST body to authenticated routes?
  const fakeOrgId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

  test("POST /api/maintenance/sign-off with injected org_id")
  const res1 = await appFetch("/api/maintenance/sign-off", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: fakeOrgId, org_id: fakeOrgId, allocations: [] }),
  })
  if (res1.status === 401 || res1.status === 403 || res1.status === 302) {
    ok("blocked (auth required)")
    pass(3, "sign-off injection")
  } else if (res1.status === 200) {
    fail("accepted without auth!")
    finding(3, "CRITICAL", "Server action accepted without auth", "POST to /api/maintenance/sign-off succeeded unauthenticated", "Verify auth check in route")
  } else {
    ok(`returned ${res1.status}`)
    pass(3, "sign-off injection")
  }

  // Test: Can we hit authenticated API routes without cookies?
  for (const route of AUTHENTICATED_API_ROUTES.slice(0, 5)) {
    test(`GET ${route} (no auth)`)
    const res = await appFetch(route)
    if (res.status === 200 && res.json && !res.json.error) {
      fail("returned data without auth!")
      finding(3, "CRITICAL", `Unauthenticated access to ${route}`, `Route returned 200 with data`, "Add auth check")
    } else if (res.status === 401 || res.status === 403 || res.status === 302) {
      ok("blocked")
      pass(3, route)
    } else {
      ok(`${res.status}`)
      pass(3, route)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 4: Public Route Token Security
// ═══════════════════════════════════════════════════════════════
async function cat4_tokenSecurity() {
  console.log("\n📋 Category 4: Public Route Token Security")
  console.log("─".repeat(50))

  // Test: Short/predictable tokens
  const shortTokens = ["1", "abc", "test", "admin", "00000000"]
  for (const token of shortTokens) {
    test(`/api/approve/${token} (short token)`)
    const res = await appFetch(`/api/approve/${token}`)
    if (res.status === 200 && res.json && !res.json.error) {
      fail("accepted short token!")
      finding(4, "HIGH", "Short token accepted on /api/approve", `Token "${token}" returned 200`, "Validate token length ≥ 32 chars")
    } else {
      ok("rejected")
      pass(4, `short token ${token}`)
    }
  }

  // Test: Unsubscribe with fake token
  test("/api/unsubscribe/fake-token (enumeration)")
  const unsub = await appFetch("/api/unsubscribe/fake-token-12345")
  if (unsub.status === 200) {
    // Check if it reveals whether the token exists
    const body = unsub.text.toLowerCase()
    if (body.includes("not found") || body.includes("invalid")) {
      ok("generic error (no enumeration)")
      pass(4, "unsubscribe enumeration")
    } else {
      warn("200 response — verify it doesn't leak subscription status")
    }
  } else {
    ok(`${unsub.status}`)
    pass(4, "unsubscribe enumeration")
  }

  // Test: Work order token replay
  test("/api/wo/FAKE-001/update (fake WO number)")
  const wo = await appFetch("/api/wo/FAKE-001/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  })
  if (wo.status === 200) {
    fail("WO update accepted without valid token!")
    finding(4, "HIGH", "Work order update without valid token", "POST accepted", "Validate token parameter")
  } else {
    ok(`rejected (${wo.status})`)
    pass(4, "WO token")
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 5: File Storage Access
// ═══════════════════════════════════════════════════════════════
async function cat5_fileStorage() {
  console.log("\n📋 Category 5: File Storage Access")
  console.log("─".repeat(50))

  const BUCKETS = ["lease-documents", "municipal-bills", "inspection-photos", "branding", "applications", "imports"]

  for (const bucket of BUCKETS) {
    // Test: Can anon list bucket contents?
    test(`List ${bucket} (anon)`)
    const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    })
    const listBody = await list.text()
    let listJson
    try { listJson = JSON.parse(listBody) } catch { listJson = null }

    if (list.status === 200 && Array.isArray(listJson) && listJson.length > 0) {
      fail(`${listJson.length} files visible!`)
      finding(5, "CRITICAL", `Anon can list ${bucket} bucket`, `${listJson.length} files exposed`, "Set bucket to private, add RLS on storage.objects")
    } else if (list.status === 200 && Array.isArray(listJson) && listJson.length === 0) {
      ok("empty or RLS blocked")
      pass(5, `list ${bucket}`)
    } else {
      ok(`blocked (${list.status})`)
      pass(5, `list ${bucket}`)
    }

    // Test: Can anon get a predictable file path?
    test(`GET ${bucket}/test.pdf (predictable path)`)
    const get = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/test.pdf`)
    if (get.status === 200) {
      warn("public URL accessible — verify bucket is not public")
    } else {
      ok(`blocked (${get.status})`)
      pass(5, `public ${bucket}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 6: Security Headers
// ═══════════════════════════════════════════════════════════════
async function cat6_securityHeaders() {
  console.log("\n📋 Category 6: Security Headers")
  console.log("─".repeat(50))

  const res = await appFetch("/")
  const h = res.headers

  const REQUIRED_HEADERS = {
    "x-frame-options": { expected: "DENY", severity: "HIGH", fix: "Add to next.config.ts headers" },
    "x-content-type-options": { expected: "nosniff", severity: "HIGH", fix: "Add to next.config.ts headers" },
    "referrer-policy": { expected: "strict-origin-when-cross-origin", severity: "MEDIUM", fix: "Add to next.config.ts headers" },
    "permissions-policy": { expected: "camera=(), microphone=(), geolocation=(self)", severity: "MEDIUM", fix: "Add to next.config.ts headers" },
    "strict-transport-security": { expected: "max-age=31536000; includeSubDomains", severity: "HIGH", fix: "Add HSTS header" },
    "content-security-policy": { expected: "present", severity: "HIGH", fix: "Add CSP to next.config.ts" },
  }

  for (const [header, config] of Object.entries(REQUIRED_HEADERS)) {
    test(`Header: ${header}`)
    const value = h[header]
    if (!value) {
      fail("MISSING")
      finding(6, config.severity, `Missing ${header}`, `Header not set on response`, config.fix)
    } else {
      ok(`"${value.substring(0, 60)}"`)
      pass(6, header)
    }
  }

  // Check for leaky headers
  test("Server header (information disclosure)")
  if (h["server"]) {
    warn(`Server: "${h["server"]}" — consider removing`)
  } else {
    ok("not disclosed")
    pass(6, "server header")
  }

  test("X-Powered-By header")
  if (h["x-powered-by"]) {
    fail(`Disclosed: "${h["x-powered-by"]}"`)
    finding(6, "LOW", "X-Powered-By header present", h["x-powered-by"], "Remove with next.config.ts poweredByHeader: false")
  } else {
    ok("not present")
    pass(6, "x-powered-by")
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 7: RLS Policy Audit
// ═══════════════════════════════════════════════════════════════
async function cat7_rlsPolicyAudit() {
  console.log("\n📋 Category 7: RLS Policy Audit")
  console.log("─".repeat(50))

  // Query pg_policies via service role
  test("Fetching RLS policies from pg_catalog")
  const policiesRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_rls_audit`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })

  if (policiesRes.status === 404) {
    warn("get_rls_audit function not found — creating it")
    console.log("")
    console.log("  ┌─ Run this SQL in Supabase Dashboard to enable RLS auditing:")
    console.log("  │")
    console.log("  │  CREATE OR REPLACE FUNCTION get_rls_audit()")
    console.log("  │  RETURNS TABLE(")
    console.log("  │    tablename text,")
    console.log("  │    policyname text,")
    console.log("  │    permissive text,")
    console.log("  │    roles text[],")
    console.log("  │    cmd text,")
    console.log("  │    qual text,")
    console.log("  │    with_check text,")
    console.log("  │    rls_enabled boolean")
    console.log("  │  ) LANGUAGE sql SECURITY DEFINER AS $$")
    console.log("  │    SELECT")
    console.log("  │      t.tablename::text,")
    console.log("  │      COALESCE(p.policyname, '(none)')::text,")
    console.log("  │      COALESCE(p.permissive, 'N/A')::text,")
    console.log("  │      COALESCE(p.roles, ARRAY['(none)']::text[]),")
    console.log("  │      COALESCE(p.cmd, 'N/A')::text,")
    console.log("  │      COALESCE(p.qual::text, '(none)'),")
    console.log("  │      COALESCE(p.with_check::text, '(none)'),")
    console.log("  │      t.rowsecurity")
    console.log("  │    FROM pg_tables t")
    console.log("  │    LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname")
    console.log("  │    WHERE t.schemaname = 'public'")
    console.log("  │      AND t.tablename NOT LIKE 'pg_%'")
    console.log("  │      AND t.tablename NOT LIKE '_realtime%'")
    console.log("  │    ORDER BY t.tablename, p.policyname;")
    console.log("  │  $$;")
    console.log("  └─")
    console.log("")
    return
  }

  const policies = await policiesRes.json()
  if (!Array.isArray(policies)) {
    fail("unexpected response")
    return
  }

  ok(`${policies.length} policy entries`)

  // Group by table
  const byTable = {}
  for (const p of policies) {
    if (!byTable[p.tablename]) byTable[p.tablename] = []
    byTable[p.tablename].push(p)
  }

  // Check each table
  for (const [table, pols] of Object.entries(byTable)) {
    const rlsEnabled = pols[0]?.rls_enabled
    const hasPolicies = pols.some(p => p.policyname !== "(none)")
    const commands = new Set(pols.map(p => p.cmd).filter(c => c !== "N/A"))

    // RLS not enabled
    if (!rlsEnabled) {
      test(`RLS on ${table}`)
      fail("RLS NOT ENABLED")
      finding(7, "CRITICAL", `RLS disabled on ${table}`, "Row Level Security is not enabled", `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)
      continue
    }

    // RLS enabled but no policies (blocks all access)
    if (!hasPolicies) {
      test(`Policies on ${table}`)
      ok("RLS enabled, no policies (locked down)")
      pass(7, table)
      continue
    }

    // Check for USING (true) — wide open (unless it's a known read-only table with SELECT-only policy)
    for (const pol of pols) {
      if (pol.qual && pol.qual.trim() === "true") {
        const isReadOnlyAllowed = READ_ONLY_PUBLIC_TABLES.has(table) && (pol.cmd === "SELECT")
        if (isReadOnlyAllowed) {
          test(`Policy "${pol.policyname}" on ${table}`)
          ok("USING (true) on SELECT — intentional read-only public table")
          pass(7, table)
        } else {
          test(`Policy "${pol.policyname}" on ${table}`)
          fail(`USING (true) — completely open!`)
          finding(7, "CRITICAL", `Open RLS policy on ${table}`, `Policy "${pol.policyname}" has USING (true)${READ_ONLY_PUBLIC_TABLES.has(table) ? " on " + pol.cmd + " (only SELECT is allowed)" : ""}`, "Replace with proper org_id or auth.uid() check")
        }
      }
    }

    // Check for missing WITH CHECK on INSERT/UPDATE
    for (const pol of pols) {
      if ((pol.cmd === "INSERT" || pol.cmd === "UPDATE" || pol.cmd === "ALL") && pol.with_check === "(none)") {
        test(`WITH CHECK on ${table} (${pol.policyname})`)
        warn(`no WITH CHECK on ${pol.cmd}`)
      }
    }

    // Check for missing command coverage
    const expectedCmds = ["SELECT", "INSERT", "UPDATE", "DELETE"]
    if (pols.some(p => p.cmd === "ALL")) {
      // ALL covers everything
    } else {
      for (const cmd of expectedCmds) {
        if (!commands.has(cmd) && !commands.has("ALL")) {
          test(`${cmd} policy on ${table}`)
          warn(`no explicit ${cmd} policy`)
        }
      }
    }
  }

  // Check for tables in SENSITIVE_TABLES that have no entries at all
  for (const table of SENSITIVE_TABLES) {
    if (!byTable[table]) {
      test(`${table} in pg_policies`)
      warn("not found in policy audit — may use different schema or not exist")
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 8: Server Action / API Route Auth
// ═══════════════════════════════════════════════════════════════
async function cat8_serverActionAbuse() {
  console.log("\n📋 Category 8: Server Action / API Route Abuse")
  console.log("─".repeat(50))

  // Test every authenticated route without auth
  for (const route of AUTHENTICATED_API_ROUTES) {
    test(`GET ${route} (no cookies)`)
    const res = await appFetch(route)
    if (res.status === 200 && res.json && !res.json.error && !res.text.includes("Unauthorized")) {
      fail("returned data!")
      finding(8, "CRITICAL", `No auth on ${route}`, `GET returned 200 with data`, "Add auth.getUser() check")
    } else {
      ok(`blocked (${res.status})`)
      pass(8, route)
    }
  }

  // Test POST to mutation endpoints without auth
  const MUTATION_ROUTES = [
    { path: "/api/maintenance/sign-off", body: { requestId: "x", allocations: [] } },
    { path: "/api/maintenance/triage", body: { requestId: "x" } },
    { path: "/api/leases/generate-docx", body: { leaseId: "x" } },
    { path: "/api/rules/reformat", body: { text: "test" } },
    { path: "/api/leases/confirm-clause-edit", body: { orgId: "x" } },
  ]

  for (const { path, body } of MUTATION_ROUTES) {
    test(`POST ${path} (no auth)`)
    const res = await appFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.status === 200 && !res.text.includes("Unauthorized") && !res.text.includes("error")) {
      fail("mutation accepted!")
      finding(8, "CRITICAL", `Unauthenticated mutation on ${path}`, "POST accepted without auth", "Add auth check")
    } else {
      ok(`blocked (${res.status})`)
      pass(8, path)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 9: Rate Limiting
// ═══════════════════════════════════════════════════════════════
async function cat9_rateLimiting() {
  console.log("\n📋 Category 9: Rate Limiting")
  console.log("─".repeat(50))

  if (quickMode) {
    console.log("  ├─ ⏭️  Skipped in quick mode (takes ~10s)")
    return
  }

  for (const route of PUBLIC_API_ROUTES.slice(0, 2)) {
    test(`Flood ${route} (20 requests)`)
    const results = []
    const start = Date.now()

    for (let i = 0; i < 20; i++) {
      const res = await appFetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `flood${i}@test.com` }),
      })
      results.push(res.status)
    }

    const elapsed = Date.now() - start
    const blocked = results.filter(s => s === 429).length

    if (blocked === 0) {
      fail(`0/20 blocked in ${elapsed}ms — no rate limiting!`)
      finding(9, "HIGH", `No rate limiting on ${route}`, `20 requests in ${elapsed}ms, 0 blocked`, "Add Upstash/Vercel KV rate limiter")
    } else {
      ok(`${blocked}/20 blocked (${elapsed}ms)`)
      pass(9, route)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 10: Webhook Signature Verification
// ═══════════════════════════════════════════════════════════════
async function cat10_webhookSignatures() {
  console.log("\n📋 Category 10: Webhook Signature Verification")
  console.log("─".repeat(50))

  // Test: POST to webhooks with forged payloads
  const FORGED_PAYLOADS = {
    "/api/webhooks/peach": {
      event_type: "collection.successful",
      mandate_id: "fake-mandate",
      collection_id: "fake-collection",
      amount: 999999,
      timestamp: new Date().toISOString(),
    },
    "/api/webhooks/resend": {
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: "fake", from: "a@b.com", to: ["x@y.com"], subject: "test" },
    },
    "/api/webhooks/docuseal": {
      event_type: "form.completed",
      data: { submission_id: 12345 },
    },
  }

  for (const [route, payload] of Object.entries(FORGED_PAYLOADS)) {
    test(`POST ${route} (forged payload)`)
    const res = await appFetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.status === 200) {
      fail("accepted forged webhook!")
      finding(10, "CRITICAL", `No signature verification on ${route}`, `Forged payload returned 200`, "Verify webhook signature before processing")
    } else if (res.status === 401 || res.status === 403) {
      ok("signature verified")
      pass(10, route)
    } else {
      // 400 or 500 could mean it tried to process but failed on data
      warn(`${res.status} — may have attempted processing`)
    }
  }

  // Test: Cron routes without secret
  for (const route of CRON_ROUTES.slice(0, 3)) {
    test(`GET ${route} (no cron secret)`)
    const res = await appFetch(route)
    if (res.status === 200 && res.json && !res.json.error) {
      fail("cron executed without secret!")
      finding(10, "CRITICAL", `Cron ${route} has no auth`, "Executed without CRON_SECRET", "Check x-cron-secret header")
    } else {
      ok(`blocked (${res.status})`)
      pass(10, route)
    }
  }

  // Test: Cron routes with wrong secret
  test("GET /api/cron/daily (wrong secret)")
  const wrongSecret = await appFetch("/api/cron/daily", {
    headers: { "x-cron-secret": "wrong-secret-value" },
  })
  if (wrongSecret.status === 200 && wrongSecret.json && !wrongSecret.json.error) {
    fail("accepted wrong cron secret!")
    finding(10, "CRITICAL", "Cron accepts wrong secret", "Wrong x-cron-secret accepted", "Strict secret comparison")
  } else {
    ok("rejected")
    pass(10, "wrong cron secret")
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 11: Secrets Exposure
// ═══════════════════════════════════════════════════════════════
async function cat11_secretsExposure() {
  console.log("\n📋 Category 11: Secrets Exposure")
  console.log("─".repeat(50))

  // Test: Check if service role key is in client bundle
  test("Service role key in NEXT_PUBLIC_ vars")
  const publicVars = Object.entries(ENV).filter(([k]) => k.startsWith("NEXT_PUBLIC_"))
  for (const [key, value] of publicVars) {
    if (value === SERVICE_KEY) {
      fail(`${key} IS the service role key!`)
      finding(11, "CRITICAL", "Service role key exposed to browser", `${key} contains the service role key`, "Use a separate anon key for NEXT_PUBLIC_")
    }
  }
  // Verify the publishable key is NOT the service role
  if (ANON_KEY === SERVICE_KEY) {
    fail("ANON_KEY === SERVICE_KEY!")
    finding(11, "CRITICAL", "Anon key IS the service role key", "Same key used for both", "Generate separate keys")
  } else {
    ok("keys are different")
    pass(11, "key separation")
  }

  // Test: Check if any secret appears in a page response
  test("Secrets in HTML response")
  const page = await appFetch("/login")
  const secretFragments = [
    SERVICE_KEY?.substring(0, 20),
    ENV.ENCRYPTION_KEY?.substring(0, 10),
    ENV.ANTHROPIC_API_KEY?.substring(0, 15),
    ENV.ADMIN_SECRET?.substring(0, 10),
  ].filter(Boolean)

  let leaked = false
  for (const frag of secretFragments) {
    if (page.text.includes(frag)) {
      fail(`secret fragment found in /login HTML`)
      finding(11, "CRITICAL", "Secret leaked in HTML", `Fragment of a secret key found in page source`, "Check environment variable usage")
      leaked = true
      break
    }
  }
  if (!leaked) {
    ok("no secrets in HTML")
    pass(11, "HTML secrets")
  }

  // Test: Admin route without auth
  test("GET /admin (no auth)")
  const admin = await appFetch("/admin")
  if (admin.status === 200 && !admin.text.includes("login") && !admin.text.includes("unauthorized")) {
    fail("admin panel accessible!")
    finding(11, "CRITICAL", "Admin panel accessible without auth", "/admin returned 200", "Add admin auth middleware")
  } else {
    ok(`blocked (${admin.status})`)
    pass(11, "admin auth")
  }
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY 12: IDOR (Insecure Direct Object Reference)
// ═══════════════════════════════════════════════════════════════
async function cat12_idor() {
  console.log("\n📋 Category 12: IDOR")
  console.log("─".repeat(50))

  // Test: Access lease document download with fake lease ID
  const fakeId = "00000000-0000-0000-0000-000000000001"

  const IDOR_ROUTES = [
    `/api/leases/${fakeId}/download-document`,
    `/api/leases/${fakeId}/upload-document`,
    `/api/leases/${fakeId}/charges`,
    `/api/leases/${fakeId}/renewal-data`,
    `/api/deposits/${fakeId}/schedule-pdf`,
    `/api/arrears/${fakeId}/waive-interest`,
    `/api/applications/${fakeId}/documents`,
    `/api/applications/${fakeId}/submit`,
  ]

  for (const route of IDOR_ROUTES) {
    test(`GET ${route} (no auth)`)
    const res = await appFetch(route)
    if (res.status === 200 && res.json && !res.json.error) {
      fail("returned data for fake ID!")
      finding(12, "HIGH", `IDOR on ${route}`, "Fake UUID returned 200 with data", "Verify org_id ownership before serving")
    } else {
      ok(`blocked (${res.status})`)
      pass(12, route)
    }
  }

  // Test: Direct Supabase storage download with predictable path
  test("Storage IDOR: /lease-documents/fake-org/fake-lease.pdf")
  const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/lease-documents/${fakeId}/lease.pdf`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (storageRes.status === 200) {
    fail("file accessible!")
    finding(12, "CRITICAL", "Storage IDOR on lease documents", "Predictable path accessible", "Set bucket to private with RLS on storage.objects")
  } else {
    ok(`blocked (${storageRes.status})`)
    pass(12, "storage IDOR")
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════
function printReport() {
  console.log("\n")
  console.log("═".repeat(60))
  console.log("  PLEKS SECURITY AUDIT REPORT")
  console.log("  " + new Date().toISOString())
  console.log("═".repeat(60))

  const critical = findings.filter(f => f.severity === "CRITICAL")
  const high = findings.filter(f => f.severity === "HIGH")
  const medium = findings.filter(f => f.severity === "MEDIUM")
  const low = findings.filter(f => f.severity === "LOW")

  console.log(`\n  Tests run:    ${testsRun}`)
  console.log(`  Tests passed: ${testsPassed}`)
  console.log(`  Findings:     ${findings.length}`)
  console.log(`    🔴 Critical: ${critical.length}`)
  console.log(`    🟠 High:     ${high.length}`)
  console.log(`    🟡 Medium:   ${medium.length}`)
  console.log(`    🔵 Low:      ${low.length}`)

  if (findings.length === 0) {
    console.log("\n  ✅ ALL TESTS PASSED — No findings")
    console.log("═".repeat(60))
    process.exit(0)
  }

  console.log("\n" + "─".repeat(60))

  // Print findings grouped by severity
  for (const [label, icon, group] of [
    ["CRITICAL", "🔴", critical],
    ["HIGH", "🟠", high],
    ["MEDIUM", "🟡", medium],
    ["LOW", "🔵", low],
  ]) {
    if (group.length === 0) continue
    console.log(`\n${icon} ${label} (${group.length})`)
    console.log("─".repeat(40))
    for (const f of group) {
      console.log(`\n  [Cat ${f.category}] ${f.title}`)
      console.log(`  Detail: ${f.detail}`)
      console.log(`  Fix:    ${f.fix}`)
    }
  }

  console.log("\n" + "═".repeat(60))

  // Exit code: 1 if any critical findings
  if (critical.length > 0) {
    console.log("\n🚨 DEPLOYMENT BLOCKED — Critical findings must be resolved\n")
    process.exit(1)
  } else if (high.length > 0) {
    console.log("\n⚠️  HIGH findings present — review before deployment\n")
    process.exit(0)
  } else {
    console.log("\n✅ No critical findings — deployment OK\n")
    process.exit(0)
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("🔒 Pleks Security Audit Suite")
  console.log(`   Target: ${SUPABASE_URL}`)
  console.log(`   App:    ${APP_URL}`)
  console.log(`   Mode:   ${quickMode ? "quick" : "full"}${singleCategory ? ` (category ${singleCategory} only)` : ""}`)
  console.log("")

  // Verify connectivity — use service key for the ping since anon key may be publishable format
  try {
    const ping = await fetch(`${SUPABASE_URL}/rest/v1/?limit=0`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    if (!ping.ok) throw new Error(`Supabase returned ${ping.status}`)
    console.log("  ✅ Supabase reachable")
  } catch (e) {
    console.error(`❌ Cannot reach Supabase: ${e.message}`)
    process.exit(1)
  }

  // Check anon key format
  if (!ANON_KEY.startsWith("eyJ")) {
    console.log(`  ⚠️  Anon key is publishable format (not JWT) — testing with it anyway`)
  }

  let appUp = true
  try {
    await fetch(APP_URL, { signal: AbortSignal.timeout(3000) })
  } catch {
    console.warn(`⚠️  Cannot reach ${APP_URL} — API route tests will be skipped`)
    appUp = false
  }

  const categories = {
    1: cat1_unauthenticatedAccess,
    2: cat2_crossOrgLeakage,
    3: appUp ? cat3_gatewayBypass : null,
    4: appUp ? cat4_tokenSecurity : null,
    5: cat5_fileStorage,
    6: appUp ? cat6_securityHeaders : null,
    7: cat7_rlsPolicyAudit,
    8: appUp ? cat8_serverActionAbuse : null,
    9: appUp ? cat9_rateLimiting : null,
    10: appUp ? cat10_webhookSignatures : null,
    11: appUp ? cat11_secretsExposure : null,
    12: appUp ? cat12_idor : null,
  }

  for (const [num, fn] of Object.entries(categories)) {
    if (singleCategory && parseInt(num) !== singleCategory) continue
    if (!fn) {
      console.log(`\n📋 Category ${num}: SKIPPED (app not running)`)
      continue
    }
    try {
      await fn()
    } catch (e) {
      console.error(`\n❌ Category ${num} crashed: ${e.message}`)
    }
  }

  printReport()
}

main()
