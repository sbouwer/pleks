/**
 * app/(dashboard)/settings/security/tabs.ts — Security category tab set (shared server + client)
 *
 * Notes:  Plain module so the server page (?tab validation) and the client CategoryTabs strip both
 *         import the real array. Two tabs: Password & 2FA (password + authenticator + passkeys, side by
 *         side cards) · Sessions.
 */
import type { DetailTab } from "@/lib/detail/types"

export const SECURITY_TABS: DetailTab[] = [
  { id: "password", label: "Password & 2FA" },
  { id: "sessions", label: "Sessions" },
]
