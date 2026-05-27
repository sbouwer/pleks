/**
 * scripts/migrate-totp-host-claims.ts — one-off migration for existing TOTP factors
 *
 * Notes:  §5.5 ADDENDUM_AUTH_RESOLVER. Existing TOTP factors whose friendly_name
 *         contains no host claim are defaulted to 'localhost' (safer assumption —
 *         dev/test factors are more likely to exist than production factors that
 *         predated the host-scoping rollout, given the platform launched after this spec).
 *
 *         Run once after deploying ADDENDUM_AUTH_RESOLVER to production:
 *           npx tsx scripts/migrate-totp-host-claims.ts
 *
 *         Idempotent — factors that already have a host claim are skipped.
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!
const HOST_SEPARATOR  = " @ "
const DEFAULT_HOST    = "localhost" // conservative default

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  process.exit(1)
}

const service = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  console.log("Fetching all users...")
  const { data: { users }, error: listErr } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (listErr || !users) {
    console.error("listUsers failed:", listErr)
    process.exit(1)
  }

  let checked = 0, migrated = 0, skipped = 0

  for (const user of users) {
    const { data: factors } = await service.auth.admin.mfa.listFactors({ userId: user.id })
    if (!factors?.totp?.length) continue

    for (const factor of factors.totp) {
      checked++
      const name = factor.friendly_name ?? ""
      if (name.includes(HOST_SEPARATOR)) { skipped++; continue }

      const newName = name ? `${name}${HOST_SEPARATOR}${DEFAULT_HOST}` : `Factor${HOST_SEPARATOR}${DEFAULT_HOST}`
      const { error: updateErr } = await service.auth.admin.mfa.updateFactor({
        userId:   user.id,
        factorId: factor.id,
        // @ts-expect-error — friendly_name is writable via admin API but typing may lag
        friendlyName: newName,
      })
      if (updateErr) {
        console.error(`  ✗ ${user.email} factor ${factor.id}: ${updateErr.message}`)
      } else {
        migrated++
        console.log(`  ✓ ${user.email}: "${name}" → "${newName}"`)
      }
    }
  }

  console.log(`\nDone — ${checked} factors checked, ${migrated} migrated, ${skipped} already host-scoped.`)
  console.log(
    "Next step: notify affected production users to re-enrol on app.pleks.co.za within 30 days."
  )
}

run().catch((err) => { console.error(err); process.exit(1) })
