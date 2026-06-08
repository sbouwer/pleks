/**
 * app/(dashboard)/settings/notifications/tabs.ts — Notifications category tab set (shared server + client)
 *
 * Notes:  Plain module so the server page (?tab validation) and the client CategoryTabs strip both import
 *         the real array. Notifications (which events send) · Email setup (sender identity + sending domain).
 */
import type { DetailTab } from "@/lib/detail/types"

export const NOTIFICATION_TABS: DetailTab[] = [
  { id: "notifications", label: "Notifications" },
  { id: "email", label: "Email setup" },
]
