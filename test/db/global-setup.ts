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
  if (!container) {
    // ⚠ THE THIRD BRANCH COMMITTED THE DEFECT THE OTHER TWO WERE FIXED FOR. It read
    // "no running `supabase_db` container — run `npx supabase start` first", which is a CAUSE, and
    // reaching this line does not establish it: `docker ps --filter` SUCCEEDED and returned empty,
    // so the daemon answered. Empty is equally consistent with the filter looking at a different
    // daemon (a second `docker` binary, or a non-default context — `docker context ls`), or with the
    // container existing under a name the filter does not match.
    //
    // Measured 2026-08-21: a `test:db` run failed with the old message while Docker had been up for
    // days, containers included. The message sent the session to `npx supabase start` — the one fix
    // that was already in place — and the real cause was never found, because the diagnostic had
    // consumed the evidence. It is not reproducible now, and that is the point: the observations
    // below are what the NEXT occurrence needs, and nothing collects them after the throw.
    const observe = (label: string, cmd: string): string => {
      try {
        return `  ${label}: ${execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim().replace(/\r?\n/g, " | ") || "(empty)"}`
      } catch (e) {
        return `  ${label}: (command failed — ${e instanceof Error ? e.message.split("\n")[0] : String(e)})`
      }
    }
    throw new Error(
      [
        "DB tests: `docker ps` answered, but no container matched `--filter name=supabase_db`.",
        "  Reporting what was OBSERVED rather than naming a cause — the daemon replied, so this is",
        "  NOT the 'Docker is not running' case, and it may not be the 'not started' case either.",
        `  docker binary chosen: ${docker}`,
        `  candidates considered: ${dockerCandidates().join(" | ")}`,
        observe("docker context", `"${docker}" context ls --format "{{.Name}}{{if .Current}} *CURRENT*{{end}}"`),
        observe("ALL containers (unfiltered)", `"${docker}" ps -a --format "{{.Names}} [{{.State}}]"`),
        // ⚠ THIS BLOCK USED TO END "If the list above is empty, `npx supabase start` is the fix."
        // It fired for real on 2026-08-22 inside the RELEASE job, where that advice is wrong twice
        // over: a CI runner has no stack to start, and the DB tier had no business running there at
        // all. One turn after replacing a message that named a cause, the replacement named one —
        // in its last line, where it read as a helpful closing note rather than as a claim.
        "  Candidate causes, none of them established by reaching this line:",
        "   · the local stack is not started        → `npx supabase start`",
        "   · this client is not the one holding the containers (see the context and binary above)",
        "   · nothing was ever meant to run here    → a CI runner or a git hook on a machine with no",
        "     Docker stack. If this came from a `git push`, the pre-push hook ran the DB tier in an",
        "     environment that cannot host it; unwire the hook for that caller, do not weaken the tier.",
      ].join("\n"),
    )
  }

  execSync(`"${docker}" exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${GRANTS}"`, {
    stdio: "pipe",
  })

  // Sweep any orgs left by a crashed/aborted prior run so the DB doesn't accumulate test data.
  cleanupStrayTestOrgs()
}
