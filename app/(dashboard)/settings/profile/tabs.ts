/**
 * app/(dashboard)/settings/profile/tabs.ts — My profile tab set (shared server + client)
 *
 * Notes:  Plain module (NO "use client") so both the server page and the client tab strip import the
 *         real array. Importing data from a "use client" module into a server component yields a client
 *         reference, not the value (PROFILE_TABS.some → "not a function"). Single source of truth for
 *         the tab set + ?tab validation.
 */
import type { DetailTab } from "@/lib/detail/types"

export const PROFILE_TABS: DetailTab[] = [
  { id: "personal", label: "Personal information" },
  { id: "contact", label: "Contact & address" },
  { id: "signature", label: "Signature" },
]
