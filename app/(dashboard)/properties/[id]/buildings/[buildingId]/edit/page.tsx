import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import { BuildingForm } from "@/components/properties/BuildingForm"
import { BackLink } from "@/components/ui/BackLink"

export default async function EditBuildingPage({
  params,
}: {
  params: Promise<{ id: string; buildingId: string }>
}) {
  const { id, buildingId } = await params
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createServiceClient()

  const [{ data: property }, { data: building }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("id", id)
      .eq("org_id", membership.org_id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("buildings")
      .select("*")
      .eq("id", buildingId)
      .eq("property_id", id)
      .eq("org_id", membership.org_id)
      .is("deleted_at", null)
      .single(),
  ])

  if (!property || !building) notFound()

  return (
    <div>
      <BackLink href={`/properties/${id}`} label={property.name} />
      <h1 className="font-heading text-2xl mb-6">Edit building — {building.name}</h1>
      <div className="max-w-2xl">
        <BuildingForm propertyId={id} building={building} />
      </div>
    </div>
  )
}
