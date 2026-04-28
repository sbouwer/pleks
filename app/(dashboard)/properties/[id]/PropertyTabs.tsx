/**
 * app/(dashboard)/properties/[id]/PropertyTabs.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { cn } from "@/lib/utils"

const BASE_TABS = [
  { id: "overview",   label: "Overview" },
  { id: "units",      label: "Buildings & units" },
  { id: "insurance",  label: "Insurance & risk" },
  { id: "operations", label: "Operations" },
  { id: "documents",  label: "Documents" },
] as const

interface PropertyTabsProps {
  activeTab:        string
  propertyId:       string
  hasManagingScheme?: boolean
}

export function PropertyTabs({
  activeTab,
  propertyId,
  hasManagingScheme = false,
}: Readonly<PropertyTabsProps>) {
  const tabs = hasManagingScheme
    ? [
        ...BASE_TABS.slice(0, 3),
        { id: "scheme", label: "Scheme & compliance" },
        ...BASE_TABS.slice(3),
      ]
    : BASE_TABS

  return (
    <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto overflow-y-hidden">
      {tabs.map((tab) => (
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
