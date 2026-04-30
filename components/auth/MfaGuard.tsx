"use client"

/**
 * components/auth/MfaGuard.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

const AGENT_ROLES = ["owner", "property_manager", "agent", "accountant", "maintenance_manager"]

// Paths that are always exempt from the MFA guard
const EXEMPT_PREFIXES = [
  "/settings/security",
  "/login",
  "/select-role",
  "/403",
  "/onboarding",
]

export function MfaGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const isExempt = EXEMPT_PREFIXES.some(p => pathname.startsWith(p))
    if (isExempt) return

    const supabase = createClient()

    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Only enforce for agent-role users
      const orgCookieRaw = document.cookie
        .split("; ")
        .find(row => row.startsWith("pleks_org="))
        ?.split("=")[1]

      let role: string | null = null
      if (orgCookieRaw) {
        try {
          role = (JSON.parse(decodeURIComponent(orgCookieRaw)) as { role?: string }).role ?? null
        } catch { /* ignore */ }
      }

      if (!role || !AGENT_ROLES.includes(role)) return

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      // If nextLevel is aal2 and currentLevel is aal1, user needs MFA
      if (aal?.nextLevel === "aal2" && aal?.currentLevel === "aal1") {
        router.replace(`/login/mfa?redirect=${encodeURIComponent(pathname)}`)
        return
      }

      // If user has no factors at all (nextLevel=aal1), check profile flag
      if (aal?.nextLevel === "aal1") {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("mfa_recovery_pending")
          .eq("id", user.id)
          .maybeSingle()

        // If this is a completely fresh agent account (no factors and not yet prompted),
        // redirect to enrolment. The login page also handles this for returning users.
        if (profile && profile.mfa_recovery_pending === null) {
          // Could be a pre-BUILD_62 agent — redirect to enrol
          // Don't redirect if already going to dashboard root (avoid loop)
          if (pathname === "/dashboard") return // let them through; enrol is voluntary for existing
        }
      }
    }

    check()
  }, [pathname, router])

  return null
}
