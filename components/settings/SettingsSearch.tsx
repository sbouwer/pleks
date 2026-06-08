"use client"

/**
 * components/settings/SettingsSearch.tsx — the settings Overview search
 *
 * Notes:  Reuses the global search combobox (components/layout/GlobalSearch) but drives it with the
 *         local settings index (lib/settings/searchIndex) — so it searches ONLY /settings/* destinations
 *         (categories + tabs), never properties/tenants/invoices. Client wrapper so the search fn isn't
 *         passed across the server→client boundary. Results group by section.
 */
import { User, Building2, CreditCard, LifeBuoy } from "lucide-react"
import { GlobalSearch, type SearchGroupConfig } from "@/components/layout/GlobalSearch"
import { searchSettings } from "@/lib/settings/searchIndex"

const TYPE_CONFIG: Record<string, SearchGroupConfig> = {
  account: { label: "Account", icon: User },
  workspace: { label: "Workspace", icon: Building2 },
  finance: { label: "Finance", icon: CreditCard },
  support: { label: "Support", icon: LifeBuoy },
}
const GROUP_ORDER = ["account", "workspace", "finance", "support"]

export function SettingsSearch() {
  return (
    <GlobalSearch
      placeholder="Search settings — branding, two-factor, plan…"
      containerClassName="w-full"
      minChars={1}
      enableShortcut={false}
      search={(q) => Promise.resolve(searchSettings(q))}
      typeConfig={TYPE_CONFIG}
      groupOrder={GROUP_ORDER}
    />
  )
}
