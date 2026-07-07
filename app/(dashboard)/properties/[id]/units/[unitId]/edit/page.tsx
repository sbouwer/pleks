/**
 * app/(dashboard)/properties/[id]/units/[unitId]/edit/page.tsx — Redirects legacy unit-edit URL to the unit detail page
 *
 * Route:  /properties/[id]/units/[unitId]/edit
 * Notes:  redirect-only → /properties/[id]/units/[unitId]
 */
import { redirect } from "next/navigation"

export default async function EditUnitPage({
  params,
}: {
  readonly params: Promise<{ id: string; unitId: string }>
}) {
  const { id, unitId } = await params
  redirect(`/properties/${id}/units/${unitId}`)
}
