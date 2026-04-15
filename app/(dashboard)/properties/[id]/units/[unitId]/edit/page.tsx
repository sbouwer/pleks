import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { updateUnit } from "@/lib/actions/units"
import { UnitForm } from "../../UnitForm"
import type { FurnishingItem } from "@/lib/units/furnishingTemplates"
import { BackLink } from "@/components/ui/BackLink"

export default async function EditUnitPage({
  params,
}: {
  readonly params: Promise<{ id: string; unitId: string }>
}) {
  const { id, unitId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: unit }, membershipResult, { data: furnishings }] = await Promise.all([
    supabase.from("units").select("*, properties(name)").eq("id", unitId).single(),
    supabase.from("user_orgs").select("org_id").eq("user_id", user.id).is("deleted_at", null).single(),
    supabase.from("unit_furnishings").select("category, item_name, quantity, condition, notes, is_custom").eq("unit_id", unitId),
  ])

  if (!unit) notFound()
  if (!membershipResult.data) redirect("/onboarding")

  const service = await createServiceClient()
  const { data: members } = await service
    .from("user_orgs")
    .select("user_id, role, user_profiles(full_name)")
    .eq("org_id", membershipResult.data.org_id)
    .is("deleted_at", null)

  const boundAction = updateUnit.bind(null, unitId, id)
  const property = unit.properties as unknown as { name: string }

  const mappedFurnishings: FurnishingItem[] = (furnishings ?? []).map((f) => ({
    category: f.category as FurnishingItem["category"],
    item_name: f.item_name,
    quantity: f.quantity ?? 1,
    condition: f.condition ?? undefined,
    notes: f.notes ?? undefined,
    is_custom: f.is_custom ?? false,
  }))

  return (
    <div>
      <BackLink href={`/properties/${id}/units/${unitId}`} label={unit.unit_number} />
      <h1 className="font-heading text-3xl mb-1">Edit Unit</h1>
      <p className="text-muted-foreground text-sm mb-6">{property.name} — {unit.unit_number}</p>
      <UnitForm
        action={boundAction}
        members={(members as never) || []}
        defaultValues={{
          unit_number: unit.unit_number,
          unit_type: unit.unit_type ?? undefined,
          floor: unit.floor ?? undefined,
          size_m2: unit.size_m2 ? Number.parseFloat(unit.size_m2) : undefined,
          bedrooms: unit.bedrooms ?? undefined,
          bathrooms: unit.bathrooms ? Number.parseFloat(unit.bathrooms) : undefined,
          parking_bays: unit.parking_bays ?? 0,
          furnishing_status: unit.furnishing_status ?? "unfurnished",
          furnishings: mappedFurnishings,
          features: (unit.features as string[]) || [],
          asking_rent: unit.asking_rent_cents ? unit.asking_rent_cents / 100 : undefined,
          deposit_amount: unit.deposit_amount_cents ? unit.deposit_amount_cents / 100 : undefined,
          managed_by: unit.managed_by ?? undefined,
          notes: unit.notes ?? undefined,
        }}
      />
    </div>
  )
}
