/**
 * app/(dashboard)/settings/security/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createClient } from "@/lib/supabase/server"
import { Shield, Smartphone } from "lucide-react"
import { PasskeyManager } from "@/components/auth/PasskeyManager"

export const metadata = { title: "Security settings" }

export default async function SecurityPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const totpCount = factors?.totp?.length ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-2xl mb-1">Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage two-factor authentication and active sessions.
        </p>
      </div>

      {/* MFA Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Two-factor authentication
        </h2>
        <div className="rounded-lg border border-rule bg-surface-raised divide-y divide-rule">
          <div className="flex items-start gap-4 p-4">
            <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Authenticator app</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {totpCount === 0 && "No authenticator enrolled"}
                {totpCount === 1 && <span className="text-amber-600">1 device enrolled — add a second for backup</span>}
                {totpCount >= 2 && <span className="text-green-600">{totpCount} devices enrolled</span>}
              </div>
            </div>
            <Link
              href="/settings/security/enrol-totp"
              className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
            >
              {totpCount === 0 ? "Set up" : "Add another"}
            </Link>
          </div>
        </div>
      </section>

      <PasskeyManager />

      {/* Sessions Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sessions
        </h2>
        <div className="rounded-lg border border-rule bg-surface-raised divide-y divide-rule">
          <div className="flex items-center gap-4 p-4">
            <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">Active sessions &amp; sign-in history</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                View and revoke access from other devices
              </div>
            </div>
            <Link
              href="/settings/security/sessions"
              className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
            >
              View
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
