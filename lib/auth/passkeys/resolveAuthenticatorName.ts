/**
 * lib/auth/passkeys/resolveAuthenticatorName.ts — AAGUID → human authenticator name
 *
 * Data:   lib/auth/passkeys/aaguid-registry.json — VENDORED, never fetched at runtime
 * Notes:  ADDENDUM_62F §1.1 / §11 item 2, queue item 8.
 *
 *         Users reason about passkeys badly in the abstract and well when the thing is named.
 *         "Saved to Google Password Manager — this will sync to your other devices" is actionable;
 *         `ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4` is not, and neither is "Unknown authenticator".
 *
 *         PROVENANCE — see `aaguid-registry.provenance.json` beside the data, which records the
 *         source repo and URL, the fetch date, the upstream sha256, and the byte counts either side
 *         of the strip. It is REGENERATED WITH the registry by `scripts/vendor-aaguid-registry.mjs`,
 *         so the two cannot drift. This comment deliberately restates none of those numbers: the
 *         version it used to carry said "fetched 2026-08-16, 328,455 bytes" and would have been
 *         quietly wrong the moment anyone re-vendored — a hand-maintained copy of a machine fact.
 *
 *         ⚠ Re-vendor ONLY with that script — `node scripts/vendor-aaguid-registry.mjs`. Do not
 *         hand-edit either file and do not add entries from memory: a wrong UUID silently labels a
 *         Windows Hello key "iCloud Keychain", which is worse than showing the raw hex — the user
 *         then makes a sync assumption that is false, which is exactly the §1 failure this is meant
 *         to prevent. `--check` diffs the vendored copy against upstream without writing.
 *
 *         RESOLVED AT READ TIME, NOT STORED. `user_passkeys` has no `authenticator_name` column and
 *         does not need one: storing the resolved string would go stale whenever the registry adds
 *         or renames a provider, and would need a backfill each time. The AAGUID is the durable
 *         fact; the name is a rendering of it.
 */
import registry from "./aaguid-registry.json"

/**
 * FLAT shape: `{ "<aaguid>": "<name>" }`.
 *
 * Upstream ships `{ name, icon_light, icon_dark }`, where the two base64 icons are **99% of the
 * file** — 328,455 bytes down to 3,224 when stripped. §1 only ever asked for the NAME, and shipping
 * 320KB of unused base64 to a tenant on a budget Android on 3G is the exact user this arc keeps
 * saying it is building for. So the vendor step strips to name-only, and this module reads the
 * stripped shape.
 *
 * ⚠ If you re-vendor, strip. A raw upstream copy makes every lookup here return `undefined` —
 * silently, because `"a string"?.name` is not a type error at runtime. The registry test asserts the
 * shape for exactly that reason.
 */
const REGISTRY = registry as Record<string, string>

/** All-zero AAGUID: the spec's "authenticator declines to identify itself". Common and not an error. */
const ANONYMOUS_AAGUID = "00000000-0000-0000-0000-000000000000"

/**
 * Human name for an AAGUID, or null when it cannot be resolved.
 *
 * Returns NULL rather than a guess or a placeholder string. The caller decides how to render an
 * unknown authenticator ("This device", "Security key") — inventing a name here would put a
 * plausible-but-wrong label in front of a user making a security decision.
 */
export function resolveAuthenticatorName(aaguid: string | null | undefined): string | null {
  if (!aaguid) return null
  const key = aaguid.trim().toLowerCase()
  if (key === ANONYMOUS_AAGUID) return null
  return REGISTRY[key] ?? null
}

/**
 * Display label with a sensible fallback, for UI that must show something.
 * BE/BS drive the "syncs to your devices" badge separately — do not infer sync from the name.
 */
export function authenticatorDisplayName(aaguid: string | null | undefined): string {
  return resolveAuthenticatorName(aaguid) ?? "Passkey"
}

/** Exposed for tests: the vendored registry size, so a truncated or empty file is detectable. */
export const REGISTRY_ENTRY_COUNT = Object.keys(REGISTRY).length
