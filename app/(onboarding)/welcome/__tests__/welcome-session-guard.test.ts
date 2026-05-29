/**
 * app/(onboarding)/welcome/__tests__/welcome-session-guard.test.ts
 *
 * Regression guard for the expired-session render throw: the /welcome server component
 * calls supabase.auth.getUser(), whose token-refresh fetch can THROW (not just return
 * {user:null}) once the access token expires mid-flow. A Server Component can't persist
 * a refreshed cookie, so the page must recover by redirecting to the resolver rather than
 * letting the throw trip the error boundary. Closes the test gap that let it ship.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const state = vi.hoisted(() => ({
  mode: "throw" as "throw" | "nouser" | "ok",
  lastRedirect: "",
}))

// redirect() normally throws a NEXT_REDIRECT control-flow signal; capture the target.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.lastRedirect = url; throw new Error("NEXT_REDIRECT") },
}))

// Don't pull the real client component (and its transitive CSS/hook imports) into node env.
vi.mock("@/app/(onboarding)/welcome/WelcomeClient", () => ({ default: () => null }))

function serviceBuilder() {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is"]) b[m] = () => b
  b.single = async () => ({ data: { full_name: "Ada", welcome_seen: false }, error: null })
  b.maybeSingle = async () => ({ data: null, error: null })
  return b
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => {
        if (state.mode === "throw") throw new TypeError("Error in input stream")
        if (state.mode === "nouser") return { data: { user: null }, error: null }
        return { data: { user: { id: "u1", email: "ada@co.za" } }, error: null }
      },
    },
  })),
  createServiceClient: vi.fn(async () => ({ from: () => serviceBuilder() })),
}))

const { default: WelcomePage } = await import("@/app/(onboarding)/welcome/page")

beforeEach(() => { state.mode = "throw"; state.lastRedirect = "" })

describe("/welcome — expired-session render guard", () => {
  it("getUser() THROWS → redirects to the resolver (preserving redirect), not the error boundary", async () => {
    state.mode = "throw"
    await expect(WelcomePage({ searchParams: Promise.resolve({ redirect: "/dashboard" }) }))
      .rejects.toThrow("NEXT_REDIRECT")
    expect(state.lastRedirect).toContain("/auth/resolver")
    expect(state.lastRedirect).toContain("redirect=")
  })

  it("getUser() returns no user → redirects to the resolver (which re-auths to /login)", async () => {
    state.mode = "nouser"
    await expect(WelcomePage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("NEXT_REDIRECT")
    expect(state.lastRedirect).toContain("/auth/resolver")
  })
})
