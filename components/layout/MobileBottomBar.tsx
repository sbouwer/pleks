"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, Plus, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { MobileMoreSheet } from "./MobileMoreSheet"
import { MobileQuickAdd } from "./MobileQuickAdd"

interface BottomTabProps {
  href?: string
  icon: React.ElementType
  label: string
  active?: boolean
  onClick?: () => void
}

function BottomTab({ href, icon: Icon, label, active, onClick }: BottomTabProps) {
  const inner = (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 px-3 py-1.5",
        active ? "text-brand" : "text-muted-foreground"
      )}
    >
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

  return (
    <>
      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
      <MobileQuickAdd open={addOpen} onOpenChange={setAddOpen} />
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border safe-area-inset-bottom">
        <div className="flex justify-around items-center h-14 px-2">
          <BottomTab
            href="/dashboard"
            icon={Home}
            label="Home"
            active={pathname === "/dashboard"}
          />
          <BottomTab
            icon={Search}
            label="Search"
            onClick={() => {
              /* TODO: open search */
            }}
          />
          <BottomTab icon={Plus} label="Add" onClick={() => setAddOpen(true)} />
          <BottomTab icon={Menu} label="More" onClick={() => setMoreOpen(true)} />
        </div>
      </nav>
    </>
  )
}
