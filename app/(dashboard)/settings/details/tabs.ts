/**
 * app/(dashboard)/settings/details/tabs.ts — Organisation category tab set (shared server + client)
 *
 * Notes:  Plain module (NO "use client") so both the server page and the client tab strip import the
 *         real array — importing data from a "use client" module into a server component yields a client
 *         reference, not the value (ORG_TABS.some → "not a function"). Single source of truth for the
 *         Organisation tab set + ?tab validation. `hours` + `emergency` are capability-gated
 *         (caps.hasOpeningHours) — the page filters them out for orgs without opening hours.
 */
import type { DetailTab } from "@/lib/detail/types"

export const ORG_TABS: DetailTab[] = [
  { id: "details", label: "Details" },
  { id: "branding", label: "Branding" },
  { id: "hours", label: "Hours" },
  { id: "emergency", label: "Emergency" },
  { id: "configuration", label: "Configuration" },
]

/** Tab ids only available when the org has the opening-hours capability. */
export const HOURS_GATED_TABS = ["hours", "emergency"]
