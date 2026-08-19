/**
 * test/db/resolve-docker.ts — locate the `docker` CLI for the DB test tier
 *
 * Notes:  Extracted from global-setup so it can be unit-tested WITHOUT Docker and without pulling
 *         in the tier's database client. The resolution logic is the part that can be wrong, and a
 *         probe for it must not depend on the thing it resolves.
 *
 *         Why this exists at all: Docker Desktop installs per-user
 *         (%LOCALAPPDATA%\Programs\DockerDesktop) and writes its PATH entry to the registry. A
 *         process started before that update keeps its environment for life — on Windows, new env
 *         reaches a process tree only through a WM_SETTINGCHANGE-aware relaunch, so if Explorer is
 *         stale every terminal it spawns is stale too. Observed 2026-08-19: registry PATH correct,
 *         daemon up, supabase_db healthy 20h, and `docker` unfindable in every shell.
 */

/** First candidate the probe accepts, or null. Probe is injected so both directions are testable. */
export function resolveDockerFrom(candidates: string[], probe: (c: string) => boolean): string | null {
  for (const c of candidates) if (probe(c)) return c
  return null
}

/**
 * PATH first, then where the installers actually put it.
 * Takes only the one variable it reads, rather than the whole env — this project's `ProcessEnv`
 * requires `NODE_ENV`, so a full-env parameter would force every caller and test into a cast.
 */
export function dockerCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const local = env.LOCALAPPDATA
  return [
    "docker",
    local ? `${local}\\Programs\\DockerDesktop\\resources\\bin\\docker.exe` : "",
    "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
  ].filter(Boolean)
}
