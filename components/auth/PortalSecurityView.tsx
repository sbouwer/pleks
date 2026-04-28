"use client"

import Link from "next/link"
import { Smartphone } from "lucide-react"
import { SessionsView } from "./SessionsView"
import { PasskeyManager } from "./PasskeyManager"

interface Props {
  readonly userId: string
  readonly totpCount: number
  readonly role: "tenant" | "landlord" | "supplier"
}

const ENROL_HREF: Record<string, string> = {
  tenant:   "/tenant/account/security/enrol-totp",
  landlord: "/landlord/account/security/enrol-totp",
  supplier: "/supplier/account/security/enrol-totp",
}

export function PortalSecurityView({ userId, totpCount, role }: Props) {
  const enrolHref = ENROL_HREF[role] ?? "/settings/security/enrol-totp"

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="font-heading text-2xl mb-1">Extra protection</h1>
        <p className="text-sm text-muted-foreground">
          Add a second sign-in check to protect your account.
        </p>
      </div>

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
                {totpCount === 0
                  ? "Not set up"
                  : <span className="text-green-600">{totpCount} device{totpCount === 1 ? "" : "s"} enrolled</span>}
              </div>
            </div>
            <Link
              href={enrolHref}
              className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
            >
              {totpCount === 0 ? "Set up" : "Add another"}
            </Link>
          </div>
        </div>
      </section>

      <PasskeyManager />

      <SessionsView userId={userId} selfOnly />
    </div>
  )
}
