/**
 * lib/detail/contactActions.ts — Call / Email / WhatsApp quick-actions for a detail-page DetailQuickbar
 *
 * Notes:  shared by the contact detail pages (supplier/landlord/tenant) so the phone→wa.me normalisation and
 *         the action shape live in one place. Omits any channel the contact doesn't have.
 */
import type { DetailAction } from "./types"

export function contactActions(primaryPhone: string | null, primaryEmail: string | null): DetailAction[] {
  const digits = primaryPhone?.replaceAll(/\D/g, "") ?? null
  let wa: string | null = null
  if (digits) wa = digits.startsWith("0") ? `27${digits.slice(1)}` : digits

  const actions: DetailAction[] = []
  if (primaryPhone) actions.push({ key: "call", label: "Call", icon: "phone", href: `tel:${primaryPhone}` })
  if (primaryEmail) actions.push({ key: "email", label: "Email", icon: "email", href: `mailto:${primaryEmail}` })
  if (wa) actions.push({ key: "whatsapp", label: "WhatsApp", icon: "whatsapp", href: `https://wa.me/${wa}` })
  return actions
}
