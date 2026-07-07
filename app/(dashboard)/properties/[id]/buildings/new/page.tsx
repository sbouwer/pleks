/**
 * app/(dashboard)/properties/[id]/buildings/new/page.tsx — Add-building form page
 *
 * Route:  /properties/[id]/buildings/new
 * Auth:   getServerOrgMembership() gate; data via service client
 * Data:   reads properties (org-scoped)
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import { BuildingForm } from "@/components/properties/BuildingForm"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function NewBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createServiceClient()
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()
    logQueryError("NewBuildingPage properties", propertyError)

  if (!property) notFound()

  return (
    <div>
      <BackLink href={`/properties/${id}`} label={property.name} />
      <h1 className="font-heading text-2xl mb-6">Add building</h1>
      <div className="max-w-2xl">
        <BuildingForm propertyId={id} />
      </div>
    </div>
  )
}
