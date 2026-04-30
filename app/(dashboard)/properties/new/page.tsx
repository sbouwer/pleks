/**
 * app/(dashboard)/properties/new/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { WizardProvider } from "./WizardContext"
import { WizardShell }   from "./WizardShell"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  return (
    <div className="mx-auto w-full max-w-5xl px-2 py-3 sm:py-4">
      <WizardProvider>
        <WizardShell />
      </WizardProvider>
    </div>
  )
}
