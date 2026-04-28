/**
 * app/(dashboard)/properties/[id]/units/[unitId]/edit/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
