import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { WizardProvider } from "./WizardContext"
import { WizardShell }   from "./WizardShell"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Add Property</h1>
      <WizardProvider>
        <WizardShell />
      </WizardProvider>
    </div>
  )
}
