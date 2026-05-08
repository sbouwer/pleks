/**
 * app/(dashboard)/settings/subscription/confirm-cancel/page.tsx — Magic-link cancel confirmation
 *
 * Route:  /settings/subscription/confirm-cancel
 * Auth:   gatewaySSR() — arrived here via /auth/callback after email magic link
 * Data:   subscriptions via confirmCancellation() server action
 * Notes:  Only reachable via magic link (no-MFA path). Calls confirmCancellation() on load.
 *         Renders a brief "confirming…" state then redirects to /settings/subscription.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { confirmCancellation } from "../actions"

export const metadata = { title: "Confirming cancellation" }

export default async function ConfirmCancelPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const result = await confirmCancellation()

  if ("error" in result) {
    const code = result.code ?? "unknown"
    redirect(`/settings/subscription?cancel_error=${encodeURIComponent(code)}`)
  }

  redirect("/settings/subscription?cancelled=1")
}
