/**
 * app/(dashboard)/properties/[id]/scheme/edit/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect, notFound } from "next/navigation"
import { BackLink } from "@/components/ui/BackLink"
import { SchemeEditForm } from "./SchemeEditForm"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function SchemeEditPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>
}>) {
  const { id: propertyId } = await params
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createServiceClient()
  const orgId = membership.org_id

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, name, managing_scheme_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
    logQueryError("SchemeEditPage properties", propertyError)

  if (!property) notFound()

  const managingSchemeId = (property as Record<string, unknown>).managing_scheme_id as string | null

  let scheme: Record<string, unknown> | null = null
  if (managingSchemeId) {
    const { data, error: queryError } = await supabase
      .from("managing_schemes")
      .select("id, name, scheme_type, csos_registration_number, levy_cycle, csos_ombud_contact, notes")
      .eq("id", managingSchemeId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .single()
    logQueryError("SchemeEditPage managing_schemes", queryError)
    scheme = data as Record<string, unknown> | null
  }

  return (
    <div className="max-w-xl">
      <BackLink href={`/properties/${propertyId}?tab=scheme`} label="Scheme & compliance" />
      <h1 className="font-heading text-2xl font-bold mb-6">
        {scheme ? "Edit managing scheme" : "Add managing scheme"}
      </h1>

      <SchemeEditForm
        propertyId={propertyId}
        defaults={{
          schemeId:               scheme ? (scheme.id as string) : null,
          name:                   (scheme?.name as string | null) ?? null,
          schemeType:             (scheme?.scheme_type as string | null) ?? null,
          csosRegistrationNumber: (scheme?.csos_registration_number as string | null) ?? null,
          levyCycle:              (scheme?.levy_cycle as string | null) ?? null,
          csosOmbudContact:       (scheme?.csos_ombud_contact as string | null) ?? null,
          notes:                  (scheme?.notes as string | null) ?? null,
        }}
      />
    </div>
  )
}
