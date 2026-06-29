/**
 * lib/detail/contactActions.ts — Call / Email / WhatsApp quick-actions for a detail-page DetailQuickbar
 *
 * Notes:  shared by the contact detail pages (supplier/landlord/tenant). The phone→E.164 / wa.me normalisation
 *         comes from the system-wide SSOT (lib/validation/contact), so it validates (an unparseable number simply
 *         drops the WhatsApp action) and handles +27 / 0027 / foreign numbers correctly. Omits absent channels.
 */
import type { DetailAction } from "./types"
import { normalizePhone, phoneToWhatsApp } from "@/lib/validation/contact"

export function contactActions(primaryPhone: string | null, primaryEmail: string | null): DetailAction[] {
  const wa = phoneToWhatsApp(primaryPhone)        // digits-only E.164, or null if invalid
  const tel = normalizePhone(primaryPhone) ?? primaryPhone

  const actions: DetailAction[] = []
  if (primaryPhone) actions.push({ key: "call", label: "Call", icon: "phone", href: `tel:${tel}` })
  if (primaryEmail) actions.push({ key: "email", label: "Email", icon: "email", href: `mailto:${primaryEmail}` })
  if (wa) actions.push({ key: "whatsapp", label: "WhatsApp", icon: "whatsapp", href: `https://wa.me/${wa}` })
  return actions
}
