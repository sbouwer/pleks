/**
 * app/(dashboard)/settings/templates/tabs.ts — tab set for the Templates category page
 *
 * Notes:  Plain module (not "use client") so the server page can read it. "leases" is a passthrough to
 *         the dedicated, legally-guarded lease-template editor — redesigned in a later phase.
 */
import type { DetailTab } from "@/lib/detail/types"

export const TEMPLATE_TABS: DetailTab[] = [
  { id: "templates", label: "Templates" },
  { id: "notices", label: "System notices" },
  { id: "leases", label: "Lease templates" },
]
