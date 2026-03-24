import { createClient } from "@/lib/supabase/server"
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

  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", id)
    .single()

  if (!property) notFound()

  const boundAction = createUnit.bind(null, id)

  return (
    <div>
      <h1 className="font-heading text-3xl mb-1">Add Unit</h1>
      <p className="text-muted-foreground text-sm mb-6">{property.name}</p>
      <UnitForm action={boundAction} />
    </div>
  )
}
