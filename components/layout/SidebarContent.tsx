"use client"

/**
 * components/layout/SidebarContent.tsx — reusable sidebar nav renderer used by agent and tenant layouts
 *
 * Data:   NavGroup[] passed from parent layout (no DB access)
 * Notes:  isActive auto-detects index routes (any href that is a prefix of a sibling href)
 *         and forces exact matching for those — prevents Finance Overview staying lit on sub-routes.
 */

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Menu } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"

export interface NavGroup {
  title: string
  items: {
    href: string
    label: string
    icon: LucideIcon
    count?: number
  }[]
}

interface SidebarContentProps {
  readonly groups: NavGroup[]
  readonly homeHref: string
  readonly collapsed: boolean
  readonly onToggleCollapse?: () => void
  readonly onNavClick?: () => void
  readonly badge?: string
}

export function SidebarContent({
  groups,
  homeHref,
  collapsed,
  onToggleCollapse,
  onNavClick,
  badge,
}: SidebarContentProps) {
  const pathname = usePathname()
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null)

  // Reset optimistic path when real navigation completes
  useEffect(() => { setOptimisticPath(null) }, [pathname])

  const activePath = optimisticPath ?? pathname

  // Hrefs that share a prefix with a sibling (e.g. /finance when /finance/deposits also exists)
  // must use exact matching so the index item doesn't stay lit on sub-routes.
  const exactHrefs = useMemo(() => {
    const allHrefs = groups.flatMap(g => g.items.map(i => i.href))
    return new Set(
      allHrefs.filter(href => allHrefs.some(other => other !== href && other.startsWith(href + "/")))
    )
  }, [groups])

  function isActive(href: string) {
    if (href === homeHref) return activePath === homeHref
    if (exactHrefs.has(href)) return activePath === href
    return activePath === href || activePath.startsWith(href + "/")
  }

  function handleNavClick(href: string) {
    setOptimisticPath(href)
    onNavClick?.()
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo bar */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-border/50",
          collapsed ? "justify-center px-3" : "justify-between px-4"
        )}
      >
        {collapsed ? (
          <button
            onClick={onToggleCollapse}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--r-button)] hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Link href={homeHref} className="pub-wordmark" style={{ fontSize: 20 }} aria-label="Pleks">
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </Link>
              {badge && (
                <span className="text-[10px] text-muted-foreground bg-surface-elevated px-1.5 py-0.5 rounded">
                  {badge}
                </span>
              )}
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--r-button)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Collapse sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.title}
              </p>
            )}
            {collapsed && <div className="my-2 border-t border-border/50" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => handleNavClick(item.href)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-[var(--r-button)] py-2 text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-2" : "gap-3 px-3",
                        active
                          ? "bg-primary/10 text-primary ring-1 ring-primary"
                          : "text-muted-foreground hover:bg-primary/[0.08] hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && item.label}
                      {!collapsed && item.count != null && item.count > 0 && (
                        <span className="ml-auto text-[10px] font-bold leading-none bg-danger text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {item.count > 99 ? "99+" : item.count}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
