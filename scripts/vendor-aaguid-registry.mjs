#!/usr/bin/env node
/**
 * scripts/vendor-aaguid-registry.mjs — fetch, validate, strip and vendor the AAGUID→name registry
 *
 * NOW.md item 8. This is not housekeeping. The registry was first vendored by hand: fetched in one
 * terminal command, stripped in another. That second command changed the file's SHAPE from
 * `{uuid: {name, icon_light, icon_dark}}` to `{uuid: name}` — and the consumer's `REGISTRY[key]?.name`
 * then evaluated to `undefined` on a plain string. No error, no type failure, a silent null fallback
 * for every authenticator in the product. It was caught only because the test asserts the resolved
 * VALUE rather than that the lookup did not throw.
 *
 * A shape change to a vendored data file is a breaking API change, and optional chaining is precisely
 * what hides it. So the fetch and the strip belong in ONE reviewable, re-runnable artifact that
 * validates the shape it received BEFORE transforming it, and validates the shape it produced after.
 * That is this file.
 *
 * ⚠ NEVER RUN THIS AT BUILD TIME. It is a deliberate, occasional, human-reviewed step. Fetching a
 * third-party file during a build is a supply-chain path into the bundle and a network dependency in
 * CI, for a file that changes a few times a year. Run it by hand, read the diff, commit it.
 *
 * Usage:
 *   node scripts/vendor-aaguid-registry.mjs           # re-vendor (writes registry + provenance)
 *   node scripts/vendor-aaguid-registry.mjs --check    # fetch and DIFF against what is vendored
 *
 * `--check` is the drift detector: it tells you the vendored copy no longer matches upstream without
 * changing anything. Exit 1 on drift, so it can be wired to a scheduled job later if that is ever
 * wanted. It is NOT in `npm run check` — that would put a network call in the commit gate.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"

const SOURCE_REPO = "https://github.com/passkeydeveloper/passkey-authenticator-aaguids"
const SOURCE_URL =
  "https://raw.githubusercontent.com/passkeydeveloper/passkey-authenticator-aaguids/main/aaguid.json"

const REGISTRY_PATH = "lib/auth/passkeys/aaguid-registry.json"
const PROVENANCE_PATH = "lib/auth/passkeys/aaguid-registry.provenance.json"

/** Bounded, no nested quantifiers — a UUID has one shape and it is not worth a backtracking risk. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A realistic floor, not `> 0`. A glob or a fetch that decays to two entries must fail, not pass. */
const MIN_ENTRIES = 40

/**
 * Anchors asserted BY VALUE after every strip. Entry counts and UUID shapes would all still pass if
 * the transform mapped every name to the empty string, or shifted names by one key. These are the
 * "assert the value, not that it didn't throw" check, at vendor time rather than only in the test.
 * Windows Hello ships three AAGUIDs (software / TPM / VBS) under one display name.
 */
const ANCHORS = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
}

const checkOnly = process.argv.includes("--check")

function fail(msg) {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

const res = await fetch(SOURCE_URL)
if (!res.ok) fail(`fetch failed: HTTP ${res.status} from ${SOURCE_URL}`)
const raw = await res.text()
const upstreamBytes = Buffer.byteLength(raw, "utf8")
const upstreamSha = createHash("sha256").update(raw).digest("hex")

let upstream
try { upstream = JSON.parse(raw) } catch (e) { fail(`upstream is not valid JSON: ${e.message}`) }
if (typeof upstream !== "object" || upstream === null || Array.isArray(upstream)) {
  fail("upstream is not a JSON object keyed by AAGUID")
}

// ── VALIDATE THE SHAPE WE RECEIVED, BEFORE TRANSFORMING IT ───────────────────────────────────────
// This is the check whose absence caused the original incident. If upstream ever ships the flat
// {uuid: name} shape — or renames `name` — the strip below would produce a file full of `undefined`
// that looks structurally fine. Fail here instead, loudly, naming what changed.
const entries = Object.entries(upstream)
if (entries.length < MIN_ENTRIES) {
  fail(`upstream has only ${entries.length} entries (floor ${MIN_ENTRIES}) — truncated fetch or a moved file?`)
}
for (const [aaguid, value] of entries) {
  if (!UUID.test(aaguid)) fail(`upstream key is not a UUID: ${JSON.stringify(aaguid)}`)
  if (typeof value === "string") {
    fail(`UPSTREAM SHAPE CHANGED: values are now plain strings, not { name, … } objects.\n` +
         `   The strip below assumes objects. Re-read the upstream file and update this script and\n` +
         `   lib/auth/passkeys/resolveAuthenticatorName.ts TOGETHER — that mismatch is the exact\n` +
         `   silent-undefined bug this script exists to prevent.`)
  }
  if (typeof value !== "object" || value === null) fail(`upstream value for ${aaguid} is neither object nor string`)
  if (typeof value.name !== "string" || value.name.trim() === "") {
    fail(`upstream entry ${aaguid} has no usable \`name\` (got ${JSON.stringify(value.name)})`)
  }
}

// ── STRIP ────────────────────────────────────────────────────────────────────────────────────────
// icon_light / icon_dark are base64 and ~99% of the payload. §1 only ever asked for the name, and
// 320KB of unused base64 in a client bundle is a tenant on a budget Android on 3G.
const stripped = {}
for (const [aaguid, value] of entries) stripped[aaguid] = value.name

// ── VALIDATE WHAT WE PRODUCED ────────────────────────────────────────────────────────────────────
const outKeys = Object.keys(stripped)
if (outKeys.length !== entries.length) fail(`strip lost entries: ${entries.length} in, ${outKeys.length} out`)
for (const [aaguid, name] of Object.entries(stripped)) {
  if (typeof name !== "string" || name.trim() === "") fail(`stripped entry ${aaguid} has an empty name`)
}
const serialised = JSON.stringify(stripped, null, 2) + "\n"
if (/icon_(light|dark)/.test(serialised)) fail("stripped output still contains icon_ fields")
for (const [aaguid, expected] of Object.entries(ANCHORS)) {
  if (stripped[aaguid] !== expected) {
    fail(`anchor check failed: ${aaguid} resolved to ${JSON.stringify(stripped[aaguid])}, expected ${JSON.stringify(expected)}.\n` +
         `   Either upstream renamed it (update ANCHORS deliberately) or the transform is misaligned.`)
  }
}

const outBytes = Buffer.byteLength(serialised, "utf8")

// ── CHECK MODE: report drift, change nothing ─────────────────────────────────────────────────────
if (checkOnly) {
  let vendored
  try { vendored = readFileSync(REGISTRY_PATH, "utf8") } catch { fail(`no vendored registry at ${REGISTRY_PATH}`) }
  if (vendored === serialised) {
    console.log(`✅ vendored registry matches upstream — ${outKeys.length} entries, ${outBytes} bytes`)
    process.exit(0)
  }
  const vendoredParsed = JSON.parse(vendored)
  const added = outKeys.filter((k) => !(k in vendoredParsed))
  const removed = Object.keys(vendoredParsed).filter((k) => !(k in stripped))
  const renamed = outKeys.filter((k) => k in vendoredParsed && vendoredParsed[k] !== stripped[k])
  console.error(`\n⚠ DRIFT — the vendored registry no longer matches upstream.`)
  console.error(`   vendored ${Object.keys(vendoredParsed).length} entries · upstream ${outKeys.length}`)
  if (added.length) console.error(`   added:   ${added.map((k) => `${k} (${stripped[k]})`).join(", ")}`)
  if (removed.length) console.error(`   removed: ${removed.map((k) => `${k} (${vendoredParsed[k]})`).join(", ")}`)
  if (renamed.length) console.error(`   renamed: ${renamed.map((k) => `${k}: ${vendoredParsed[k]} → ${stripped[k]}`).join(", ")}`)
  console.error(`\n   Re-vendor with: node scripts/vendor-aaguid-registry.mjs\n`)
  process.exit(1)
}

// ── WRITE ────────────────────────────────────────────────────────────────────────────────────────
writeFileSync(REGISTRY_PATH, serialised)

// Provenance lives in its own file, NOT inside the registry. A `_meta` key would change the registry's
// shape — the precise failure this script exists to prevent — and the resolver reads it as a flat
// Record<string, string>. Separate file, machine-readable, regenerated with the data it describes so
// it cannot drift from it the way a hand-written header comment does.
const provenance = {
  source_repo: SOURCE_REPO,
  source_url: SOURCE_URL,
  fetched_at: new Date().toISOString().slice(0, 10),
  upstream_bytes: upstreamBytes,
  upstream_sha256: upstreamSha,
  vendored_bytes: outBytes,
  entries: outKeys.length,
  generated_by: "scripts/vendor-aaguid-registry.mjs",
  note: "Stripped to {aaguid: name}; upstream icon_light/icon_dark discarded (~99% of the payload). " +
        "Do not hand-edit either file — re-run the script.",
}
writeFileSync(PROVENANCE_PATH, JSON.stringify(provenance, null, 2) + "\n")

console.log(`✅ vendored ${outKeys.length} entries — ${upstreamBytes} → ${outBytes} bytes ` +
            `(${Math.round((1 - outBytes / upstreamBytes) * 100)}% smaller)`)
console.log(`   ${REGISTRY_PATH}`)
console.log(`   ${PROVENANCE_PATH}`)
console.log(`\n   Read the diff before committing. A renamed provider is a UI change.`)
