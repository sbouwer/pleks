import { createProperty } from "@/lib/actions/properties"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { PropertyForm } from "../PropertyForm"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Add Property</h1>
      <PropertyForm action={createProperty} />
    </div>
  )
}
