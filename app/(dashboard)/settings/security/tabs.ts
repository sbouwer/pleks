/**
 * app/(dashboard)/settings/security/tabs.ts — Security category tab set (shared server + client)
 *
 * Notes:  Plain module so the server page (?tab validation) and the client CategoryTabs strip both
 *         import the real array. Three tabs: Password · MFA (authenticator + passkeys) · Sessions.
 */
import type { DetailTab } from "@/lib/detail/types"

export const SECURITY_TABS: DetailTab[] = [
  { id: "password", label: "Password" },
  { id: "mfa", label: "MFA" },
  { id: "sessions", label: "Sessions" },
]
