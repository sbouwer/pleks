"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Search, List, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

interface PropertyFiltersProps {
  view: "list" | "cards"
}

export function PropertyFilters({ view }: PropertyFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const set = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder="Search properties…"
          defaultValue={searchParams.get("q") ?? ""}
          onChange={(e) => set("q", e.target.value)}
        />
      </div>

      {/* Status filter */}
      <select
        className="h-8 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="vacancies">Has vacancies</option>
        <option value="occupied">Fully occupied</option>
        <option value="arrears">Has arrears</option>
      </select>

      {/* View toggle */}
      <div className="flex items-center border border-border rounded-md overflow-hidden">
        <button
          onClick={() => set("view", "list")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
            view === "list" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="size-3.5" /> List
        </button>
        <button
          onClick={() => set("view", "cards")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
            view === "cards" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutGrid className="size-3.5" /> Cards
        </button>
      </div>
    </div>
  )
}
