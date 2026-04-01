import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { createUnit } from "@/lib/actions/units"
import { UnitForm } from "../UnitForm"

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: property }, membershipResult] = await Promise.all([
    supabase.from("properties").select("id, name").eq("id", id).single(),
    supabase.from("user_orgs").select("org_id").eq("user_id", user.id).is("deleted_at", null).single(),
  ])

  if (!property) notFound()
  if (!membershipResult.data) redirect("/onboarding")

  const service = await createServiceClient()
  const { data: members } = await service
    .from("user_orgs")
    .select("user_id, role, user_profiles(full_name)")
    .eq("org_id", membershipResult.data.org_id)
    .is("deleted_at", null)

  const boundAction = createUnit.bind(null, id)

  return (
    <div>
      <h1 className="font-heading text-3xl mb-1">Add Unit</h1>
      <p className="text-muted-foreground text-sm mb-6">{property.name}</p>
      <UnitForm action={boundAction} members={(members as never) || []} />
    </div>
  )
}
