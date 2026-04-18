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
