import { redirect } from "next/navigation"

export default async function EditUnitPage({
  params,
}: {
  readonly params: Promise<{ id: string; unitId: string }>
}) {
  const { id, unitId } = await params
  redirect(`/properties/${id}/units/${unitId}`)
}
