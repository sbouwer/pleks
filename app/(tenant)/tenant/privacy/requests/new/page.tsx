/**
 * app/(tenant)/tenant/privacy/requests/new/page.tsx — New data-subject request page
 *
 * Route:  /tenant/privacy/requests/new?org=<org_id>
 * Auth:   Tenant portal session
 * Notes:  Suspense wrapper required — NewRequestForm uses useSearchParams().
 */
import { Suspense } from "react"
import NewRequestForm from "./NewRequestForm"

export default function NewRequestPage() {
  return (
    <Suspense>
      <NewRequestForm />
    </Suspense>
  )
}
