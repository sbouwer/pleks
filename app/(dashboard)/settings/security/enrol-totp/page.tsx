"use client"

/**
 * app/(dashboard)/settings/security/enrol-totp/page.tsx — TOTP MFA enrolment wizard (Settings)
 *
 * Route:  /settings/security/enrol-totp
 * Auth:   Authenticated; AAL2 required only when user already has a verified factor (adding backup)
 * Notes:  Thin wrapper around <EnrolTotp>. Reads ?mandatory and ?redirect from URL params.
 *         Logic lives in components/auth/EnrolTotp.tsx — no duplication.
 */

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { EnrolTotp } from "@/components/auth/EnrolTotp"

function EnrolTotpContent() {
  const searchParams = useSearchParams()
  const mandatory = searchParams.get("mandatory") === "true"
  const redirectTo = searchParams.get("redirect") ?? undefined
  return <EnrolTotp mandatory={mandatory} redirectTo={redirectTo} variant="settings" />
}

export default function EnrolTotpPage() {
  return (
    <Suspense>
      <EnrolTotpContent />
    </Suspense>
  )
}
