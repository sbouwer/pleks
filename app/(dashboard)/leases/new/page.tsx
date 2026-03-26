import { Suspense } from "react"
import { NewLeaseForm } from "./NewLeaseForm"

export default function NewLeasePage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <NewLeaseForm />
    </Suspense>
  )
}
