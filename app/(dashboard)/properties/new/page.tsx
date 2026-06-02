/**
 * app/(dashboard)/properties/new/page.tsx — the "add a property" route (renders the wizard modal)
 *
 * Route:  /properties/new
 * Auth:   getServerOrgMembership (redirect to /login when absent)
 * Notes:  The wizard is now the universal modal (PropertyWizardModal). This route opens it
 *         immediately and returns to /properties on close — keeps the canonical add-property URL
 *         working for deep-links, the dashboard checklist and first-setup.
 */
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { NewPropertyRoute } from "./NewPropertyRoute"

export default async function NewPropertyPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  return <NewPropertyRoute />
}
