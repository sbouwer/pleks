/**
 * scripts/fitscore-replay.mjs — CLI for FitScore L3 replay integrity verification
 *
 * Usage: npm run fitscore:replay -- --application-id=<uuid> [--org-id=<uuid>]
 *
 * Notes: Reads SUPABASE_SERVICE_ROLE_KEY from environment.
 *        Requires --application-id. If --org-id is omitted, the script
 *        fetches the org_id from the application row directly.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.8, §10.8.
 */

import { createClient } from '@supabase/supabase-js'

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [key, ...rest] = a.slice(2).split('=')
      return [key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), rest.join('=')]
    })
)

const applicationId = args.applicationId
if (!applicationId) {
  console.error('Error: --application-id=<uuid> is required')
  process.exit(1)
}

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

// ─── Replay ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFitScore Replay — application ${applicationId}\n`)

  // Resolve org_id (needed for RLS; service client bypasses RLS so any org_id works for the query)
  const { data: app, error: appErr } = await db
    .from('applications')
    .select('org_id, fitscore_band, fitscore_component_snapshot, fitscore_engine_version, fitscore_inputs_hash, fitscore_components, fitscore_computed_at, fitscore_runtime_code_hash, fitscore_narrative_prompt_version')
    .eq('id', applicationId)
    .single()

  if (appErr || !app) {
    console.error('Application not found:', appErr?.message ?? 'no row')
    process.exit(1)
  }

  const orgId = args.orgId ?? app.org_id

  // ── Print stored values ────────────────────────────────────────────────────

  console.log('── Stored values ──────────────────────────────────')
  console.log(`  Band:              ${app.fitscore_band ?? '(none)'}`)
  console.log(`  Engine version:    ${app.fitscore_engine_version ?? '(none)'}`)
  console.log(`  Computed at:       ${app.fitscore_computed_at ?? '(none)'}`)
  console.log(`  Inputs hash:       ${app.fitscore_inputs_hash?.slice(0, 16) ?? '(none)'}...`)
  console.log(`  Runtime code hash: ${app.fitscore_runtime_code_hash?.slice(0, 16) ?? '(none)'}...`)
  if (app.fitscore_components) {
    const c = app.fitscore_components
    console.log(`  Affordability:     ${c.affordability}`)
    console.log(`  Stability:         ${c.stability}`)
    console.log(`  Credit Behaviour:  ${c.creditBehaviour}`)
    console.log(`  Verif. Integrity:  ${c.verificationIntegrity}`)
  }

  if (!app.fitscore_component_snapshot) {
    console.log('\n✗ No component snapshot stored — replay not possible for this application.')
    console.log('  (Score was generated before snapshot storage was added, or scoring has not run.)')
    process.exit(1)
  }

  // ── Snapshot integrity check ───────────────────────────────────────────────

  const snap = app.fitscore_component_snapshot
  console.log('\n── Snapshot verification ──────────────────────────')
  console.log(`  Engine (snapshot): ${snap.engineVersion}`)
  console.log(`  Final band:        ${snap.lease?.finalBand ?? '(missing)'}`)
  console.log(`  Rent:              R ${((snap.lease?.proposedRentCents ?? 0) / 100).toFixed(2)}`)

  const bandMatch = app.fitscore_band === snap.lease?.finalBand
  console.log(`\n  Band match:        ${bandMatch ? '✓' : '✗'} ${bandMatch ? 'OK' : `MISMATCH (stored: ${app.fitscore_band}, snapshot: ${snap.lease?.finalBand})`}`)

  let dimensionMatch = true
  if (app.fitscore_components) {
    const stored = app.fitscore_components
    const fromSnap = {
      affordability:        snap.lease?.affordabilityScore,
      stability:            snap.lease?.stabilityScore,
      creditBehaviour:      snap.lease?.creditBehaviourScore,
      verificationIntegrity: snap.lease?.verificationIntegrityDimensionalScore,
    }
    const keys = ['affordability', 'stability', 'creditBehaviour', 'verificationIntegrity']
    console.log('\n── Dimension score comparison ─────────────────────')
    for (const k of keys) {
      const storedVal = stored[k] ?? 0
      const snapVal   = fromSnap[k] ?? 0
      const ok = Math.abs(storedVal - snapVal) < 0.01
      if (!ok) dimensionMatch = false
      console.log(`  ${k.padEnd(22)}: stored=${storedVal.toFixed(1).padStart(5)}  snap=${snapVal.toFixed(1).padStart(5)}  ${ok ? '✓' : '✗ MISMATCH'}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const allOk = bandMatch && dimensionMatch && !!app.fitscore_inputs_hash
  console.log('\n── Result ─────────────────────────────────────────')
  if (allOk) {
    console.log('  ✓ INTEGRITY VERIFIED — stored outputs match component snapshot\n')
  } else {
    console.log('  ✗ INTEGRITY FAILURE — mismatches detected (see above)\n')
    console.log('  Engineering investigation required before this application can be cited as evidence.\n')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})
