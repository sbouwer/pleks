import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { WizardProvider } from "./WizardContext"
import { WizardShell }   from "./WizardShell"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:py-5">
      <header className="mb-3">
        <h1 className="font-heading text-3xl font-bold">Add Property</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A guided setup for South African property realities — sectional title, rental house,
          commercial, mixed use. Takes about 3–5 minutes.
        </p>
      </header>
      <WizardProvider>
        <WizardShell />
      </WizardProvider>
    </div>
  )
}
