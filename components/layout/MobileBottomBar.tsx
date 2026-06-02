"use client"

/**
 * components/layout/MobileBottomBar.tsx — mobile tab bar (lg:hidden) with a center quick-add FAB
 *
 * Auth:   dashboard layout (gateway)
 * Notes:  Five slots — Home / Schedule / [+ FAB] / Search / More. The FAB opens the quick-add sheet;
 *         Search opens the search sheet; More opens the nav sheet. Schedule routes to /calendar.
 */
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, CalendarDays, Search, Menu, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { MobileMoreSheet } from "./MobileMoreSheet"
import { MobileQuickAdd } from "./MobileQuickAdd"
import { MobileSearchSheet } from "./MobileSearchSheet"
import { MobileScheduleSheet } from "./MobileScheduleSheet"
import { MobileOfflineSheet } from "./MobileOfflineSheet"

interface BottomTabProps {
  readonly href?: string
  readonly icon: React.ElementType
  readonly label: string
  readonly active?: boolean
  readonly onClick?: () => void
}

function BottomTab({ href, icon: Icon, label, active, onClick }: BottomTabProps) {
  const inner = (
    <div className={cn("flex flex-col items-center gap-0.5 px-2 py-1.5", active ? "text-brand" : "text-muted-foreground")}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  )

  if (href) {
    return <Link href={href} className="flex-1 flex justify-center">{inner}</Link>
  }
  return (
    <button type="button" onClick={onClick} className="flex-1 flex justify-center">
      {inner}
    </button>
  )
}

export function MobileBottomBar() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)

  return (
    <>
      <MobileMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        onOpenOffline={() => {
          setMoreOpen(false)
          setOfflineOpen(true)
        }}
      />
      <MobileQuickAdd open={addOpen} onOpenChange={setAddOpen} />
      <MobileSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />
      <MobileScheduleSheet open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <MobileOfflineSheet open={offlineOpen} onOpenChange={setOfflineOpen} />
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-inset-bottom">
        <div className="flex items-center h-14 px-2">
          <BottomTab href="/dashboard" icon={Home} label="Home" active={pathname === "/dashboard"} />
          <BottomTab icon={CalendarDays} label="Schedule" onClick={() => setScheduleOpen(true)} />

          {/* Center FAB — quick add */}
          <div className="flex-1 flex justify-center">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Quick add"
              className="-mt-6 h-12 w-12 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-lg border-4 border-card active:scale-95 transition-transform"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          <BottomTab icon={Search} label="Search" onClick={() => setSearchOpen(true)} />
          <BottomTab icon={Menu} label="More" onClick={() => setMoreOpen(true)} />
        </div>
      </nav>
    </>
  )
}
