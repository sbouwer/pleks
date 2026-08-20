/**
 * test/db/resolve-docker.test.ts — probes for the docker CLI resolver
 *
 * Notes:  Runs in the NORMAL tier (not *.dbtest.ts) and needs no Docker — deliberately, since the
 *         thing under test is what happens when Docker cannot be found.
 */
import { describe, expect, it } from "vitest"
import { dockerCandidates, resolveDockerFrom } from "./resolve-docker"

const WIN_ENV = { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }

describe("resolveDockerFrom", () => {
  it("returns the PATH entry when docker is on PATH", () => {
    expect(resolveDockerFrom(dockerCandidates(WIN_ENV), (c) => c === "docker")).toBe("docker")
  })

  // The case that actually happened: registry PATH correct, daemon up, CLI unreachable from the
  // process because its environment predates the installer.
  it("falls back to the per-user Docker Desktop install when PATH is stale", () => {
    const found = resolveDockerFrom(dockerCandidates(WIN_ENV), (c) => c.includes("DockerDesktop"))
    expect(found).toBe("C:\\Users\\x\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe")
  })

  it("finds the legacy Program Files install", () => {
    const found = resolveDockerFrom(dockerCandidates(WIN_ENV), (c) => c.startsWith("C:\\Program Files"))
    expect(found).toBe("C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe")
  })

  // The other direction. Without this the resolver could return a truthy first candidate always
  // and every case above would still pass.
  it("returns null when nothing is acceptable", () => {
    expect(resolveDockerFrom(dockerCandidates(WIN_ENV), () => false)).toBeNull()
  })

  it("prefers PATH over the fallbacks when both would work", () => {
    expect(resolveDockerFrom(dockerCandidates(WIN_ENV), () => true)).toBe("docker")
  })
})

describe("dockerCandidates", () => {
  it("enumerates PATH plus both install locations on Windows", () => {
    expect(dockerCandidates(WIN_ENV)).toHaveLength(3)
  })

  // On a machine with no LOCALAPPDATA the per-user path would interpolate to "undefined\\..." and
  // silently become a candidate that can never match — a small instance of the never-matching
  // pattern, so it is dropped rather than carried.
  it("drops the per-user path when LOCALAPPDATA is absent", () => {
    const c = dockerCandidates({})
    expect(c).toHaveLength(2)
    expect(c.some((x) => x.includes("undefined"))).toBe(false)
  })
})
