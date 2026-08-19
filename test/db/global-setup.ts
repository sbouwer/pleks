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
import { dockerCandidates, resolveDockerFrom } from "./resolve-docker"

const GRANTS = [
  "GRANT USAGE ON SCHEMA public TO service_role",
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role",
  "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role",
  "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role",
].join("; ")

export default function setup(): void {
  // THREE distinct faults with three different fixes. This used to collapse all of them into
  // "is Docker running?", which is the one that was FALSE the day it misfired — the daemon and the
  // supabase_db container were both up for 20 hours while the CLI was merely off PATH. A diagnostic
  // that names a cause it cannot distinguish is worse than one that just reports the failure: it
  // does not merely fail to help, it routes you away from the fix.
  const docker = resolveDockerFrom(dockerCandidates(), (c) => {
    try {
      execSync(`"${c}" --version`, { stdio: "pipe" })
      return true
    } catch {
      return false
    }
  })

  if (!docker) {
    throw new Error(
      "DB tests: no `docker` CLI found — on PATH or at the known Docker Desktop locations.\n" +
        "  This is NOT the same as 'Docker is not running'. The daemon may be running fine.\n" +
        "  Windows: Docker Desktop installs per-user and updates PATH in the registry, but a\n" +
        "  process started before that update never sees it. Restarting VSCode is NOT enough if\n" +
        "  Explorer itself is stale — sign out and back in, or launch from a fresh shell.\n" +
        "  Verify with: [Environment]::GetEnvironmentVariable('Path','User') -like '*DockerDesktop*'",
    )
  }

  let container = ""
  try {
    container = execSync(`"${docker}" ps --filter name=supabase_db --format "{{.Names}}"`, { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)[0]
  } catch {
    throw new Error(
      `DB tests: the docker CLI at "${docker}" runs, but the daemon did not answer — ` +
        "THIS is the 'is Docker running?' case. Start Docker Desktop and retry.",
    )
  }
  if (!container) throw new Error("DB tests: no running `supabase_db` container — run `npx supabase start` first.")

  execSync(`"${docker}" exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${GRANTS}"`, {
    stdio: "pipe",
  })

  // Sweep any orgs left by a crashed/aborted prior run so the DB doesn't accumulate test data.
  cleanupStrayTestOrgs()
}
