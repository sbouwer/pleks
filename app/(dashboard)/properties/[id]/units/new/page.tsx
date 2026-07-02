/**
 * app/(dashboard)/properties/[id]/units/new/page.tsx — add-unit form for a property (server)
 *
 * Route:  /properties/[id]/units/new
 * Auth:   gatewaySSR() (agent session + org membership)
 * Data:   properties (org-scoped) for the parent property; org members via service client for assignee picker
 */
import { createServiceClient } from "@/lib/supabase/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect, notFound } from "next/navigation"
import { createUnit } from "@/lib/actions/units"
import { UnitForm } from "../UnitForm"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/onboarding")
  const { db, orgId } = gw

  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()
    logQueryError("NewUnitPage properties", propertyError)

  if (!property) notFound()

  const service = await createServiceClient()
  const { data: members, error: membersError } = await service
    .from("user_orgs")
    .select("user_id, role, user_profiles(full_name)")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    logQueryError("NewUnitPage user_orgs", membersError)

  const boundAction = createUnit.bind(null, id)

  return (
    <div>
      <BackLink href={`/properties/${id}`} label={property.name} />
      <h1 className="font-heading text-3xl mb-1">Add Unit</h1>
      <p className="text-muted-foreground text-sm mb-6">{property.name}</p>
      <UnitForm action={boundAction} members={(members as never) || []} />
    </div>
  )
}
