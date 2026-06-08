/**
 * app/(dashboard)/settings/team/tabs.ts — Team category tab set (shared server + client)
 *
 * Notes:  Plain module so the server page (?tab validation) + the client CategoryTabs strip import the
 *         real array. The Transfer-ownership tab is OWNER-ONLY — the page appends it only when the caller
 *         is owner, so this exports the two tabs and the page composes the visible set.
 */
import type { DetailTab } from "@/lib/detail/types"

export const MEMBERS_TAB: DetailTab = { id: "members", label: "Members" }
export const TRANSFER_TAB: DetailTab = { id: "transfer", label: "Transfer ownership" }
