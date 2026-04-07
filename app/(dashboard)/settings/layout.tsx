import { createClient } from "@/lib/supabase/server"
import { SettingsNav } from "./SettingsNav"

type OrgType = "landlord" | "sole_prop" | "agency"

async function getOrgType(): Promise<OrgType> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return "agency"

  const { data } = await supabase
    .from("user_orgs")
    .select("organisations(type, user_type)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  const org = data && !Array.isArray(data.organisations) ? data.organisations : null
  if (!org) return "agency"

  if (org.type === "landlord" || org.user_type === "owner") return "landlord"
  if (org.type === "sole_prop") return "sole_prop"
  return "agency"
}

export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const orgType = await getOrgType()

  return (
    <div>
      <h1 className="font-heading text-3xl mb-4">Settings</h1>
      <SettingsNav orgType={orgType} />
      {children}
    </div>
  )
}
