/**
 * test/db/global-setup.ts — one-time bootstrap for the DB-integration tier
 *
 * Notes:  Our migrations create public tables owned by `postgres`; this local stack configures no
 *         default privileges, so `service_role` ends up without DML (only REFERENCES/TRIGGER/TRUNCATE).
 *         Hosted Supabase grants these at the platform level — we replicate that posture LOCALLY so the
 *         service-role client (the test's client AND allocatePayment's) can read/write. service_role
 *         bypasses RLS, so table grants alone give it hosted-equivalent access. anon/authenticated are
 *         left untouched so function-hardening REVOKEs still hold locally. Idempotent; runs once per suite.
 */
import { execSync } from "node:child_process"
import { cleanupStrayTestOrgs } from "./tier"

const GRANTS = [
  "GRANT USAGE ON SCHEMA public TO service_role",
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role",
  "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role",
  "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role",
].join("; ")

export default function setup(): void {
  let container = ""
  try {
    // Local test tier: `docker` is a required dev tool. Fixed literal command, no user input.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    container = execSync('docker ps --filter name=supabase_db --format "{{.Names}}"', { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)[0]
  } catch {
    throw new Error("DB tests: `docker` not available — is Docker running with `npx supabase start`?")
  }
  if (!container) throw new Error("DB tests: no running `supabase_db` container — run `npx supabase start` first.")

  execSync(`docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${GRANTS}"`, {
    stdio: "pipe",
  })

  // Sweep any orgs left by a crashed/aborted prior run so the DB doesn't accumulate test data.
  cleanupStrayTestOrgs()
}
