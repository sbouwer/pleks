"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Menu } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavGroup {
  title: string
  items: {
    href: string
    label: string
    icon: LucideIcon
  }[]
}

interface SidebarContentProps {
  groups: NavGroup[]
  homeHref: string
  collapsed: boolean
  onToggleCollapse?: () => void
  onNavClick?: () => void
  badge?: string
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

  function isActive(href: string) {
    if (href === homeHref) return pathname === homeHref
    return pathname.startsWith(href)
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
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
        ) : (
          <>
            <Link href={homeHref} className="flex items-center gap-2">
              <Image src="/logo.svg" alt="Pleks" width={90} height={26} className="h-7 w-auto" priority />
              {badge && (
                <span className="text-[10px] text-muted-foreground bg-surface-elevated px-1.5 py-0.5 rounded">
                  {badge}
                </span>
              )}
            </Link>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                      onClick={onNavClick}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-2" : "gap-3 px-3",
                        active
                          ? "bg-brand/10 text-brand"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && item.label}
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
