import Link from "next/link"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "overview",   label: "Overview" },
  { id: "units",      label: "Buildings & units" },
  { id: "documents",  label: "Documents" },
  { id: "operations", label: "Operations" },
] as const

interface PropertyTabsProps {
  activeTab: string
  propertyId: string
}

export function PropertyTabs({ activeTab, propertyId }: Readonly<PropertyTabsProps>) {
  return (
    <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto overflow-y-hidden">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/properties/${propertyId}?tab=${tab.id}`}
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
