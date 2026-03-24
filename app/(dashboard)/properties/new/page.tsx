import { createProperty } from "@/lib/actions/properties"
import { PropertyForm } from "../PropertyForm"

export default function NewPropertyPage() {
  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Add Property</h1>
      <PropertyForm action={createProperty} />
    </div>
  )
}
