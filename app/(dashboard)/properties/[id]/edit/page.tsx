import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { updateProperty } from "@/lib/actions/properties"
import { PropertyForm } from "../../PropertyForm"

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (!property) notFound()

  const boundAction = updateProperty.bind(null, id)

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Edit Property</h1>
      <PropertyForm
        action={boundAction}
        defaultValues={{
          name: property.name,
          type: property.type,
          address_line1: property.address_line1,
          address_line2: property.address_line2 || undefined,
          suburb: property.suburb || undefined,
          city: property.city,
          province: property.province,
          postal_code: property.postal_code || undefined,
          erf_number: property.erf_number || undefined,
          sectional_title_number: property.sectional_title_number || undefined,
          notes: property.notes || undefined,
        }}
      />
    </div>
  )
}
