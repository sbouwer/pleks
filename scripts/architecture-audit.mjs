#!/usr/bin/env node
/**
 * Architecture audit — catches structural / cross-file bug classes that
 * file-level review and typecheck miss. Each check is named after the
 * bug class it catches. When we hit a new class of bug, add a check here.
 *
 * Runs as part of `npm run check`. Pure file inspection — no network,
 * no DB, no app server needed. Offline-safe.
 *
 * Exit 0 on pass, 1 on fail.
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const findings = []
let checksRun = 0

function fail(check, msg, fix) {
  findings.push({ check, msg, fix })
}

function check(name, fn) {
  checksRun++
  const before = findings.length
  process.stdout.write(`  • ${name}... `)
  try {
    fn()
    console.log(findings.length === before ? "✓" : `✗ (${findings.length - before})`)
  } catch (e) {
    console.log(`✗ crashed: ${e.message}`)
    fail(name, `crashed: ${e.message}`, "investigate the audit script itself")
  }
}

// ── Helpers ──────────────────────────────────────────────────

function walk(dir, ext = /\.(tsx?|mjs|js)$/) {
  const out = []
  function recurse(d) {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
      const p = join(d, entry)
      const s = statSync(p)
      if (s.isDirectory()) recurse(p)
      else if (ext.test(entry)) out.push(p)
    }
  }
  recurse(dir)
  return out
}

function readFile(p) {
  return readFileSync(p, "utf-8")
}

function relPath(p) {
  return p.replace(ROOT, "").replaceAll("\\", "/").replace(/^\//, "")
}

// ── Route-group origin mapping ───────────────────────────────
// In production:
//   pleks.co.za (apex)  serves: APEX_PREFIXES paths (see proxy.ts)
//   app.pleks.co.za     serves: everything else
// Same-origin Links across this boundary trigger CORS on RSC prefetch
// when there's a server-side redirect between origins.

// Route groups that are exclusively marketing (apex) origin:
const MARKETING_ONLY_GROUPS = new Set(["(demo)"])  // /demo is an APEX_PREFIX
// Route groups that are exclusively app-subdomain origin:
const APP_ONLY_GROUPS = new Set(["(auth)", "(admin)", "(applicant)", "(dashboard)",
                                 "(landlord)", "(onboarding)", "(supplier)", "(tenant)", "(status)"])
// (public) is mixed — some routes are apex (terms, pricing) and some are app (login).
// Use APEX_PATH_PREFIXES to determine which.

// Paths served from pleks.co.za — mirrors APEX_PREFIXES in proxy.ts + root.
// Keep in sync when APEX_PREFIXES changes.
const APEX_PATH_PREFIXES = ["/", "/pricing", "/privacy", "/terms",
  "/credit-check-policy", "/cookie-policy", "/paia-manual", "/popia-register",
  "/definitions", "/contact", "/demo", "/marketing"]

function routeGroupOf(filePath) {
  // relPath normalises Windows backslashes to forward slashes
  const match = relPath(filePath).match(/app\/(\(\w+\))/)
  return match ? match[1] : null
}

function fileUrlPath(filePath) {
  return relPath(filePath)
    .replace(/^app\/\([^/]+\)/, "")
    .replace(/\/(page|route)\.(tsx?|ts)$/, "")
    || "/"
}

function originOf(group, filePath) {
  if (MARKETING_ONLY_GROUPS.has(group)) return "marketing"
  if (APP_ONLY_GROUPS.has(group)) return "app"
  if (group === "(public)") {
    const rel = filePath ? relPath(filePath) : ""
    // Layouts wrap ALL routes in the group including app-subdomain ones (login etc.)
    // → treat conservatively as app origin so cross-origin links get flagged
    if (/\/layout\.(tsx?|ts)$/.test(rel)) return "app"
    // page.tsx / route.ts: determine origin from the actual URL path
    if (/(page|route)\.(tsx?|ts)$/.test(rel)) {
      const urlPath = fileUrlPath(filePath)
      const isApex = APEX_PATH_PREFIXES.some(
        p => urlPath === p || urlPath.startsWith(p + "/")
      )
      return isApex ? "marketing" : "app"
    }
    // Component files: treat as marketing — primarily used from marketing pages;
    // gaps at the component level are caught via layout/page checks
    return "marketing"
  }
  return null
}

// Paths whose production server-side redirect crosses origins.
// app-side list mirrors APEX_PATH_PREFIXES above (kept as a named alias for clarity).
// marketing-side list: paths that redirect from www.pleks.co.za → app.pleks.co.za,
// PLUS /contact — shared components default to "marketing" origin but also render on
// app-subdomain pages (login etc.) via the public layout, where /contact crosses origin.
// Forcing absolute URLs for /contact in those components is the safe, consistent fix.
const CROSS_ORIGIN_REDIRECTS = {
  app: APEX_PATH_PREFIXES,
  marketing: ["/onboarding", "/login", "/dashboard", "/auth/resolver", "/contact"],
}

// ─────────────────────────────────────────────────────────────
// CHECK 1 — cross-origin Link detection (CORS bug class)
// ─────────────────────────────────────────────────────────────
// Catches: <Link href="/"> in app subdomain, or <Link href="/onboarding">
// on the marketing site. Either triggers RSC prefetch CORS failure.

function checkCrossOriginLinks() {
  // Also scan marketing components — they render inside the public layout which
  // wraps app-subdomain pages (login, forgot-password etc.), so apex-path Links
  // from these components produce the same CORS prefetch failure.
  const files = [
    ...walk(join(ROOT, "app")),
    ...walk(join(ROOT, "components", "marketing")),
  ]

  for (const file of files) {
    const group = routeGroupOf(file)
    const origin = originOf(group, file)
    if (!origin) continue

    const redirects = CROSS_ORIGIN_REDIRECTS[origin] || []
    // Strip comment lines so JSDoc examples don't trigger false positives
    const content = readFile(file).split("\n")
      .filter(line => !/^\s*(\/\/|\*)/.test(line))
      .join("\n")

    // Create regex per-file so lastIndex never bleeds between files
    const linkRegex = /<Link\s+[^>]*href=["']([^"']+)["']/g
    let m
    while ((m = linkRegex.exec(content)) !== null) {
      const href = m[1]
      if (!href.startsWith("/") || href.startsWith("//")) continue

      const justPath = href.split("?")[0]
      const triggers = redirects.some(r => justPath === r || justPath.startsWith(r + "?"))

      if (triggers) {
        // Suggest the correct target by destination, not source origin: apex paths
        // resolve to the marketing host, everything else to the app subdomain.
        const isApexDest = APEX_PATH_PREFIXES.some(
          p => justPath === p || justPath.startsWith(p + "/")
        )
        const suggestion = isApexDest
          ? `\${process.env.NEXT_PUBLIC_MARKETING_URL}${justPath}`
          : `\${process.env.NEXT_PUBLIC_APP_URL}${justPath}`
        fail("cross-origin-link", `${relPath(file)}: <Link href="${href}"> triggers cross-origin redirect (RSC prefetch will CORS-fail)`,
             `Use <a href="${suggestion}"> instead`)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 2 — safeRedirect denylist completeness (loop bug class)
// ─────────────────────────────────────────────────────────────
// Catches: a new auth-flow route added under app/(auth)/* or
// app/(onboarding)/* without being added to AUTH_INTERNAL_PREFIXES.

function checkSafeRedirectDenylist() {
  const safeRedirectPath = join(ROOT, "lib/auth/safe-redirect.ts")
  const content = readFile(safeRedirectPath)
  const prefixMatch = content.match(/AUTH_INTERNAL_PREFIXES\s*=\s*\[([^\]]+)\]/s)
  if (!prefixMatch) {
    fail("safe-redirect-denylist", "AUTH_INTERNAL_PREFIXES not found in safe-redirect.ts",
         "Restore the denylist constant")
    return
  }
  const denylist = [...prefixMatch[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1])

  // Find every page.tsx / route.ts under (auth) and (onboarding)
  const authDirs = [join(ROOT, "app/(auth)"), join(ROOT, "app/(onboarding)")]
  const authPaths = new Set()
  for (const dir of authDirs) {
    try {
      for (const f of walk(dir, /^(page|route)\.(tsx?|ts)$/)) {
        // Convert filesystem path to URL path
        const rel = relPath(f).replace(/^app\/\([^/]+\)/, "")
          .replace(/\/(page|route)\.(tsx?|ts)$/, "")
          .replace(/\[([^\]]+)\]/g, ":$1")  // dynamic segments
        authPaths.add(rel || "/")
      }
    } catch { /* dir may not exist */ }
  }

  for (const path of authPaths) {
    if (path.includes(":")) continue  // skip dynamic routes
    const covered = denylist.some(p => path === p || path.startsWith(p + "/") || path === p + "/")
    if (!covered) {
      fail("safe-redirect-denylist", `auth-flow route "${path}" is not in AUTH_INTERNAL_PREFIXES`,
           `Add "${path}" to AUTH_INTERNAL_PREFIXES in lib/auth/safe-redirect.ts`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 3 — hardcoded absolute URLs (NEXT_PUBLIC_APP_URL doctrine)
// ─────────────────────────────────────────────────────────────
// Catches: hardcoded https://app.pleks.co.za in template/email/PDF code.
// Allowlist for places that legitimately need the literal string.

const ALLOWED_HARDCODE = [
  "next.config",
  "lib/legal-versions",
  "scripts/",
  "supabase/",
  "README",
  "manifest",
  "CLAUDE.md",
  ".github/",
  "brief/",
  // Architecture audit itself references the URL strings:
  "scripts/architecture-audit.mjs",
  // Passkeys RP ID must be the exact domain string — it's a WebAuthn identifier,
  // not a navigation URL; process.env.NEXT_PUBLIC_APP_URL includes the scheme+path.
  "lib/auth/passkeys/rp-config",
  // PAIA PDF font loader: intentionally falls back to production URL when running on
  // localhost because the dev server doesn't always serve font files in PDF context.
  "app/api/paia-manual-pdf/route",
  // Test files never ship URLs to users — a literal host is just a fixture for building
  // request objects (NextRequest needs an absolute URL), not a navigation target.
  ".test.",
]

const HARDCODED_URL_RE = /https:\/\/(app\.)?pleks\.co\.za/

function countHardcodedUrlLines(content) {
  return content.split("\n").filter(line =>
    !/NEXT_PUBLIC_\w+_URL/.test(line) && HARDCODED_URL_RE.test(line)
  ).length
}

function checkHardcodedUrls() {
  const files = walk(ROOT, /\.(tsx?|mjs|js)$/)

  for (const file of files) {
    const rel = relPath(file)
    if (ALLOWED_HARDCODE.some(allowed => rel.includes(allowed))) continue

    const count = countHardcodedUrlLines(readFile(file))
    if (count > 0) {
      fail("hardcoded-url",
           `${rel}: hardcoded absolute URL (${count} line${count > 1 ? 's' : ''})`,
           `Use process.env.NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_MARKETING_URL (per absolute-URL doctrine)`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 4 — Destination kind exhaustiveness
// ─────────────────────────────────────────────────────────────
// Catches: adding a new Destination kind to decisions.ts but forgetting
// to handle it in the resolver route. TypeScript catches this too, but
// belt-and-braces.

function checkDestinationExhaustiveness() {
  const decisions = readFile(join(ROOT, "lib/auth/decisions.ts"))
  const resolver = readFile(join(ROOT, "app/(auth)/auth/resolver/route.ts"))

  const kindMatches = [...decisions.matchAll(/kind:\s*"(\w+)"/g)]
  const kinds = new Set(kindMatches.map(m => m[1]))

  const caseMatches = [...resolver.matchAll(/case\s+"(\w+)"\s*:/g)]
  const cases = new Set(caseMatches.map(m => m[1]))

  for (const kind of kinds) {
    if (!cases.has(kind)) {
      fail("destination-exhaustiveness", `Destination kind "${kind}" has no case in resolver route.ts`,
           `Add case "${kind}": to the switch in app/(auth)/auth/resolver/route.ts`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 5 — PWA manifest origin
// ─────────────────────────────────────────────────────────────
// Catches: manifest linked from marketing route-group, or start_url
// pointing to a different origin than the manifest is served from.

function checkManifestOrigin() {
  // Find every layout.tsx and check whether it renders <link rel="manifest">
  const layouts = walk(join(ROOT, "app"), /layout\.tsx$/)
  for (const layout of layouts) {
    const rel = relPath(layout)
    const group = routeGroupOf(layout)
    if (!group) continue   // root layout — separate concern

    const origin = originOf(group, layout)
    const content = readFile(layout)
    // /manifest:\s*["'\/]/ matches manifest: "/path" or manifest: '/path' — not manifest: null
    if (/<link[^>]+rel=["']manifest["']/i.test(content) || /manifest:\s*["'/]/.test(content)) {
      if (origin === "marketing") {
        fail("manifest-origin", `${rel}: marketing route-group ${group} references a manifest`,
             `PWA manifest should only be linked from app-origin route-groups`)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 6 — Cookie httpOnly vs client-readable consistency
// ─────────────────────────────────────────────────────────────
// Catches: a cookie set with AUTH_COOKIE_OPTS (httpOnly) that's also
// read via document.cookie elsewhere. The privacy-version cookie bug.

function checkCookieReadability() {
  // Find cookies set with AUTH_COOKIE_OPTS (httpOnly: true)
  const files = walk(ROOT, /\.(tsx?|mjs)$/)
  const httpOnlyCookies = new Set()
  const clientReadCookies = new Set()

  for (const file of files) {
    const content = readFile(file)
    // Server-side: cookieStore.set("name", value, {...AUTH_COOKIE_OPTS})
    const setMatches = [...content.matchAll(/cookieStore\.set\(\s*["']([^"']+)["'][^)]*AUTH_COOKIE_OPTS/g)]
    for (const m of setMatches) httpOnlyCookies.add(m[1])

    // Client-side: document.cookie reads
    const docCookieMatches = [...content.matchAll(/document\.cookie[^=]*\b(pleks_\w+)/g)]
    for (const m of docCookieMatches) clientReadCookies.add(m[1])
  }

  for (const cookie of clientReadCookies) {
    if (httpOnlyCookies.has(cookie)) {
      fail("cookie-readability", `Cookie "${cookie}" is set with httpOnly: true (via AUTH_COOKIE_OPTS) but read client-side via document.cookie`,
           `Set this cookie without spreading AUTH_COOKIE_OPTS — use {sameSite, path, secure, maxAge} only`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 7 — Route manifest entries resolve to files
// ─────────────────────────────────────────────────────────────
// Catches: a ROUTE_MANIFEST entry typo where the path doesn't match
// any file in app/.

function checkRouteManifest() {
  const manifest = readFile(join(ROOT, "lib/routing/manifest.ts"))
  const pathMatches = [...manifest.matchAll(/path:\s*["'](\/[^"']*)["']/g)]

  for (const m of pathMatches) {
    const path = m[1]
    // Convert URL path to filesystem path candidates
    // /welcome → app/(*)welcome/page.tsx — could be in any group
    const segment = path.replace(/^\//, "").replace(/\/$/, "") || ""
    if (!segment) continue   // root

    const candidates = [
      ...APP_ONLY_GROUPS, ...MARKETING_ONLY_GROUPS, "(public)",
    ].flatMap(group => [
      join(ROOT, "app", group, segment, "page.tsx"),
      join(ROOT, "app", group, segment, "route.ts"),
    ])

    const exists = candidates.some(p => {
      try { statSync(p); return true } catch { return false }
    })

    if (!exists) {
      fail("route-manifest", `ROUTE_MANIFEST path "${path}" has no matching page.tsx or route.ts in any route group`,
           `Check the path string for typos, or add the page/route file`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 8 — agent-role-gated routes must not skipOrgCheck
// ─────────────────────────────────────────────────────────────
// Catches: a ROUTE_MANIFEST entry that is gated to AGENT roles AND has
// skipOrgCheck:true. The agent role lives in the pleks_org cookie, which is
// hydrated ONLY by ensureOrgCookies — and skipOrgCheck disables that. So the
// gate sees no role, fails closed (→ to_resolver), the resolver routes back,
// and it loops forever. (This is the /welcome ERR_TOO_MANY_REDIRECTS bug.)
//
// Portal routes (/tenant, /landlord, /supplier) are EXEMPT: their role comes
// from the login-set pleks_active_role / portal_class cookie, not pleks_org,
// so skipOrgCheck doesn't strand them.

function checkSkipOrgCheckRoles() {
  const manifest = readFile(join(ROOT, "lib/routing/manifest.ts"))
  // Tokens that mark an entry as agent-role-gated
  const AGENT_TOKENS = ["AGENT_ROLES", '"owner"', '"property_manager"', '"agent"',
                        '"accountant"', '"maintenance_manager"']
  for (const line of manifest.split("\n")) {
    if (!/skipOrgCheck:\s*true/.test(line) || !/\broles:/.test(line)) continue
    if (!AGENT_TOKENS.some(t => line.includes(t))) continue  // portal roles are exempt
    const key = line.match(/["'](\/[^"']*)["']\s*:/)?.[1] ?? line.trim()
    fail("skiporgcheck-roles",
         `${key}: agent-role-gated entry has skipOrgCheck:true — the pleks_org cookie carrying the agent role is never hydrated, so the gate fails closed and loops to the resolver`,
         `Drop 'roles' (page authorizes internally) OR remove skipOrgCheck so ensureOrgCookies hydrates the role`)
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 9 — resolver targets must be gate-admittable (termination invariant)
// ─────────────────────────────────────────────────────────────
// The gate↔resolver loop CLASS (not a single instance): the resolver redirects to a
// route the gate then rejects, so it bounces back to the resolver forever. The
// structural invariant that prevents the whole class: every route the resolver can
// redirect to must be admittable by the gate in the state the resolver sends the user
// in. A role-gated route that is neither skipOrgCheck (so ensureOrgCookies always
// hydrates the role) NOR requiresAal2 (so it's only reached post-MFA, when org cookies
// are warm) can strand an AAL1 agent whose 300s pleks_org has lapsed mid-flow — the gate
// can't read the role, fails closed → to_resolver → the resolver sends them right back.
// /settings/security/enrol-totp inheriting role-gated /settings was exactly this loop.

function parseManifestRules() {
  const manifest = readFile(join(ROOT, "lib/routing/manifest.ts"))
  const rules = []
  const re = /["'](\/[^"']*)["']\s*:\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(manifest)) !== null) {
    const [, key, body] = m
    rules.push({
      key,
      roleGated:    /\broles:/.test(body),
      skipOrgCheck: /skipOrgCheck:\s*true/.test(body),
      requiresAal2: /requiresAal2:\s*true/.test(body),
    })
  }
  return rules
}

function longestPrefixRule(rules, path) {
  let best = null
  for (const r of rules) {
    if (path === r.key || path.startsWith(r.key + "/")) {
      if (!best || r.key.length > best.key.length) best = r
    }
  }
  return best
}

function checkResolverTargetsAdmittable() {
  const resolver = readFile(join(ROOT, "app/(auth)/auth/resolver/route.ts"))
  const rules = parseManifestRules()
  // Static redirect targets in execute(): url("/literal"). The "app" case uses a dynamic
  // url(dest.path) (safeNext / portal default) — not a literal, so not statically checkable
  // here; its admittance is covered by the requiresAal2 agent routes + the convergence test.
  const targets = [...resolver.matchAll(/\burl\(\s*["'](\/[^"']*)["']\s*\)/g)].map(mm => mm[1])
  const seen = new Set()
  for (const target of targets) {
    if (seen.has(target)) continue
    seen.add(target)
    const rule = longestPrefixRule(rules, target)
    if (!rule) continue   // no manifest entry → treated as public by the gate → not role-gated
    if (rule.roleGated && !rule.skipOrgCheck && !rule.requiresAal2) {
      fail("resolver-target-admittable",
           `resolver redirects to "${target}" → resolves to role-gated manifest rule "${rule.key}" with neither skipOrgCheck nor requiresAal2 — an AAL1 agent whose pleks_org has lapsed is bounced back to the resolver (loop class)`,
           `Add an explicit "${target}" entry with skipOrgCheck:true (enrolment-island pattern), or gate the route with requiresAal2`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CHECK 10 — passkey columns must not be cast to Uint8Array (ADDENDUM_62C)
// ─────────────────────────────────────────────────────────────
// passkey_challenges.challenge / user_passkeys.credential_id / public_key are base64url
// TEXT (NOT bytea): supabase-js JSON-serialises a Node Buffer into a bytea column, and
// PostgREST returns bytea as a "\x…" hex string — both corrupted the values and broke
// passkey registration AND login (they 400'd; 0 passkeys ever enrolled). The failure
// vector was `x as unknown as Uint8Array`, a cast that lied to the type checker. Reads/
// writes go through lib/auth/passkeys/encoding.ts now. Ban the cast in the passkey paths
// so the class can't return.

function checkPasskeyByteaCast() {
  const files = [
    ...walk(join(ROOT, "app", "api", "auth", "passkeys")),
    ...walk(join(ROOT, "lib", "auth", "passkeys")),
  ]
  for (const file of files) {
    if (/encoding\.ts$/.test(file)) continue   // the helper's doc comment names the banned cast
    const lines = readFile(file).split("\n")
    lines.forEach((line, i) => {
      if (/\/\//.test(line) && /as unknown as Uint8Array/.test(line)) return  // a comment about it
      if (/as unknown as Uint8Array/.test(line)) {
        fail("passkey-bytea-cast",
             `${relPath(file)}:${i + 1}: \`as unknown as Uint8Array\` on a passkey column`,
             `These columns are base64url text — decode/encode via lib/auth/passkeys/encoding.ts, never cast`)
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

console.log("\n🏛  Architecture audit")
console.log("─".repeat(50))

check("cross-origin Link patterns (CORS prefetch)", checkCrossOriginLinks)
check("safeRedirect denylist completeness", checkSafeRedirectDenylist)
check("hardcoded absolute URLs (NEXT_PUBLIC_APP_URL doctrine)", checkHardcodedUrls)
check("Destination kind exhaustiveness", checkDestinationExhaustiveness)
check("PWA manifest origin", checkManifestOrigin)
check("cookie httpOnly vs client-read consistency", checkCookieReadability)
check("ROUTE_MANIFEST entries resolve to files", checkRouteManifest)
check("skipOrgCheck routes are not role-gated", checkSkipOrgCheckRoles)
check("resolver targets are gate-admittable", checkResolverTargetsAdmittable)
check("passkey columns not cast to Uint8Array", checkPasskeyByteaCast)

console.log("─".repeat(50))
console.log(`  ${checksRun - findings.length}/${checksRun} checks passed`)

if (findings.length > 0) {
  console.log("\n  FINDINGS:")
  for (const f of findings) {
    console.log(`\n    [${f.check}]`)
    console.log(`      ${f.msg}`)
    console.log(`      Fix: ${f.fix}`)
  }
  console.log()
  process.exit(1)
}

console.log()
process.exit(0)
