"use client"

/**
 * components/layout/MobileNav.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SidebarContent, type NavGroup } from "./SidebarContent"

interface MobileNavProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: NavGroup[]
  homeHref: string
  badge?: string
}

export function MobileNav({ open, onOpenChange, groups, homeHref, badge }: MobileNavProps) {
  const pathname = usePathname()

  // Auto-close on route change
  useEffect(() => {
    onOpenChange(false)
  }, [pathname, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <SidebarContent
          groups={groups}
          homeHref={homeHref}
          collapsed={false}
          onNavClick={() => onOpenChange(false)}
          badge={badge}
        />
      </SheetContent>
    </Sheet>
  )
}
