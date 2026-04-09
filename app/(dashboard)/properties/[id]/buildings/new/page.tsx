import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { BuildingForm } from "@/components/properties/BuildingForm"

export default async function NewBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createServiceClient()
  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()

  if (!property) notFound()

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">
        <Link href="/properties" className="hover:text-foreground">Properties</Link>
        {" ›"}{" "}
        <Link href={`/properties/${id}`} className="hover:text-foreground">{property.name}</Link>
        {" › Add building"}
      </p>
      <h1 className="font-heading text-2xl mb-6">Add building</h1>
      <div className="max-w-2xl">
        <BuildingForm propertyId={id} />
      </div>
    </div>
  )
}
