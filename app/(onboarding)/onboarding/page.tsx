import { createOrganisation } from "@/lib/actions/onboarding"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OnboardingStep1Form } from "./Step1Form"

export default async function OnboardingStep1() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div>
      <h2 className="font-heading text-2xl mb-1">Tell us about your business</h2>
      <p className="text-muted-foreground text-sm mb-6">
        This helps us set up your account correctly.
      </p>
      <OnboardingStep1Form email={user.email || ""} action={createOrganisation} />
    </div>
  )
}
