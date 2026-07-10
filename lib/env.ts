/**
 * lib/env.ts — the one place that reads process.env
 *
 * Notes:  A missing or mis-scoped environment variable is otherwise discovered at USE TIME, deep inside a
 *         request — which is exactly the mechanics of the June 4–10 outage (RESEND_API_KEY read raw in a
 *         send path that only ran on a real email). This module makes the failure mode a NAMED error at the
 *         read boundary, and `assertRequiredEnv()` turns it into a health-check signal before a request ever
 *         hits it.
 *
 *         TWO HALVES, for one hard constraint:
 *
 *         1. PUBLIC (NEXT_PUBLIC_*) — Next.js statically REPLACES `process.env.NEXT_PUBLIC_X` in the client
 *            bundle at build time. That replacement only fires on a LITERAL member read, never on a dynamic
 *            `process.env[name]`. So every public var is written out once, literally, as a named export
 *            below. This file is therefore client-safe: no `server-only`, no node built-ins, so a client
 *            component can import APP_URL without pulling the server surface.
 *
 *         2. SERVER — real `process.env` at runtime. A dynamic `process.env[name]` is correct here and, for
 *            a non-NEXT_PUBLIC name, is NEVER inlined into the client bundle, so no secret can leak even
 *            though this module is importable client-side (the value is simply `undefined` there, and no
 *            client code reads it).
 *
 *         Enforced by `pleks/no-raw-process-env`: `process.env` outside this file (+ a tiny allowlist for
 *         build/instrumentation config) fails the build. Existing raw reads are baselined and burning down.
 */

// ── 1 · Public vars (NEXT_PUBLIC_*) — literal reads, single canonical default each ────────────────────
// The defaults only bite in dev / preview / misconfiguration; production sets all of these. Where callers
// disagreed on the default (APP_URL was variously "", app.pleks.co.za, AND pleks.co.za — the marketing
// domain, a latent bug), the centre picks one. See ABSOLUTE URL DISCIPLINE in CLAUDE.md.

/** The product/app origin. Emails, PDFs, deep links, QR codes resolve against this. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.pleks.co.za"
/** The marketing/apex origin. Apex, not www — the www default was drift. */
export const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || "https://pleks.co.za"
/** Public Supabase project URL (safe to expose; the publishable key gates it). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
/** Publishable (anon-equivalent) Supabase key. Name matches CLAUDE.md — NOT ANON_KEY. */
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ""
/** Sentry environment label for the browser SDK. */
export const SENTRY_ENVIRONMENT_PUBLIC = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "unknown"
/** Sentry DSN for the browser SDK (public by design). */
export const SENTRY_DSN_PUBLIC = process.env.NEXT_PUBLIC_SENTRY_DSN ?? ""
/** Human-readable app version, shown in the UI / status page. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown"
/** Build id, if injected. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev"
/** Vercel environment as seen client-side. Prefer `isProductionRuntime()` server-side. */
export const VERCEL_ENV_PUBLIC = process.env.NEXT_PUBLIC_VERCEL_ENV ?? ""
/** PayFast sandbox flag, exposed to the client checkout form. */
export const PAYFAST_SANDBOX_PUBLIC = process.env.NEXT_PUBLIC_PAYFAST_SANDBOX === "true"
/** Google Maps JS key (public, referrer-restricted). */
export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""

// ── 2 · Runtime environment (platform-provided, always present) ───────────────────────────────────────

/** True only on Vercel production. The canonical prod gate — relocated from lib/messaging/africastalking. */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production"
}

/** True when Node thinks it is production (build + local `next start`). NOT the same as isProductionRuntime. */
export function isProductionNode(): boolean {
  return process.env.NODE_ENV === "production"
}

/** True in local `next dev`. */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

/** "production" | "preview" | "development" | "" — the resolved deploy environment, Vercel first. */
export function deployEnv(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? ""
}

/** The deployed git SHA, or "local". */
export function gitCommitSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "local"
}

// ── 3 · Server vars — registry with required-in-prod metadata ─────────────────────────────────────────
// `required: true` means "must be present when isProductionRuntime()". `requireEnv` throws whenever the
// value is absent at the moment of use (if you are calling it, you need it now); `assertRequiredEnv` is the
// health/preflight sweep over the prod-required set.

interface EnvSpec {
  /** Must be set in production. Absence fails `assertRequiredEnv` and, at use, `requireEnv`. */
  required: boolean
  /** One line: what breaks without it. Shown in the thrown error and the health report. */
  purpose: string
}

const SERVER_ENV = {
  // Secrets — required in prod; a missing one is the outage class.
  SUPABASE_SERVICE_ROLE_KEY: { required: true, purpose: "service-role DB access (every gateway read/write)" },
  RESEND_API_KEY: { required: true, purpose: "all transactional email" },
  ANTHROPIC_API_KEY: { required: true, purpose: "all AI generation (routed via lib/ai/client)" },
  CRON_SECRET: { required: true, purpose: "cron route auth (via lib/cron/auth)" },
  ENCRYPTION_KEY: { required: true, purpose: "PII encryption at rest (id_number, bank accounts)" },
  ID_NUMBER_HASH_SALT: { required: true, purpose: "deterministic id_number dedup hash" },
  PASSKEY_AAL_SECRET: { required: true, purpose: "passkey / step-up challenge signing" },
  CONSENT_HMAC_SECRET: { required: true, purpose: "POPIA consent link signing" },
  ADMIN_SECRET: { required: true, purpose: "admin.pleks.co.za HMAC token" },
  INTERNAL_API_SECRET: { required: false, purpose: "internal service-to-service calls" },
  HEALTH_PROBE_TOKEN: { required: false, purpose: "deep-health probe auth" },
  // Webhook secrets — required once the corresponding provider is live.
  RESEND_WEBHOOK_SECRET: { required: false, purpose: "Resend delivery-event signature check" },
  DOCUSEAL_WEBHOOK_SECRET: { required: false, purpose: "DocuSeal signing-event signature check" },
  WA_WEBHOOK_SECRET: { required: false, purpose: "WhatsApp inbound webhook signature check" },
  SEARCHWORX_WEBHOOK_SECRET: { required: false, purpose: "Searchworx result webhook signature check" },
  AT_WEBHOOK_SECRET: { required: false, purpose: "Africa's Talking delivery webhook (TO BE IMPLEMENTED)" },
  // Provider config — optional; the feature degrades closed when unset.
  BETTERSTACK_API_KEY: { required: false, purpose: "uptime/heartbeat reporting" },
  AT_API_KEY: { required: false, purpose: "Africa's Talking SMS" },
  AT_USERNAME: { required: false, purpose: "Africa's Talking account (NEVER 'sandbox' in prod)" },
  AT_WEBHOOK_USERNAME: { required: false, purpose: "Africa's Talking webhook username" },
  API_NINJAS_KEY: { required: false, purpose: "external enrichment lookups" },
  ADMIN_EMAIL: { required: false, purpose: "platform admin notification recipient" },
  ADMIN_NAME: { required: false, purpose: "platform admin display name" },
  LEGAL_SITE_URL: { required: false, purpose: "legal-docs canonical origin override" },
} as const satisfies Record<string, EnvSpec>

export type ServerEnvName = keyof typeof SERVER_ENV

/**
 * A required server var, at its point of use. Throws a NAMED error (fail closed) if absent, rather than
 * handing back `undefined` to be discovered three calls deeper. Use for secrets you cannot proceed without.
 */
export function requireEnv(name: ServerEnvName): string {
  const value = process.env[name]
  if (!value) {
    const spec = SERVER_ENV[name]
    throw new Error(
      `Missing required environment variable ${name} — needed for ${spec.purpose}. ` +
        `Set it in Vercel (Production + Preview) and .env.local.`,
    )
  }
  return value
}

/** An optional server var, with an explicit fallback. Never throws — use where absence is a valid state. */
export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback
}

/**
 * Health / startup preflight. Returns the names of prod-required vars that are absent. Empty ⇒ healthy.
 * Only asserts in a real production runtime — dev and preview legitimately run without the full secret set.
 */
export function assertRequiredEnv(): { ok: boolean; missing: ServerEnvName[] } {
  if (!isProductionRuntime()) return { ok: true, missing: [] }
  const missing = (Object.keys(SERVER_ENV) as ServerEnvName[]).filter(
    (name) => SERVER_ENV[name].required && !process.env[name],
  )
  return { ok: missing.length === 0, missing }
}
