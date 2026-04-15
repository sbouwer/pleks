import Link from "next/link"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "overview",    label: "Overview" },
  { id: "details",     label: "Lease details" },
  { id: "contacts",    label: "Contacts" },
  { id: "finance",     label: "Finance" },
  { id: "operations",  label: "Operations" },
] as const

interface LeaseTabsProps {
  activeTab: string
  leaseId: string
}

export function LeaseTabs({ activeTab, leaseId }: LeaseTabsProps) {
  return (
    <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto overflow-y-hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/leases/${leaseId}?tab=${tab.id}`}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
            activeTab === tab.id
              ? "border-brand text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
