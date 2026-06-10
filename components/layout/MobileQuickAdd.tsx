"use client"

/**
 * components/layout/MobileQuickAdd.tsx — the center "+" quick-add sheet (bottom)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   none — routes to the page that hosts each add flow
 * Notes:  Mirrors the desktop QuickAddMenu set (landlord/property/tenant/supplier/lease) plus field
 *         capture (inspection/maintenance/payment). Door-grammar tile grid.
 */

import { useRouter } from "next/navigation"
import { useNavGate } from "@/hooks/useNavGate"
import {
  UserSquare2,
  Home,
  Users,
  HardHat,
  FileText,
  ClipboardCheck,
  Wrench,
  Banknote,
  type LucideIcon,
} from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface MobileQuickAddProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

interface AddTile {
  icon: LucideIcon
  label: string
  href: string
}

// "Add" records — routes to the page hosting each add flow (wizard/modal/new route).
const ADD: AddTile[] = [
  { icon: UserSquare2, label: "Landlord", href: "/landlords" },
  { icon: Home, label: "Property", href: "/properties" },
  { icon: Users, label: "Tenant", href: "/tenants?add=1" },
  { icon: HardHat, label: "Supplier", href: "/suppliers" },
  { icon: FileText, label: "Lease", href: "/leases/new" },
]

// Field capture — log work on the move.
const CAPTURE: AddTile[] = [
  { icon: ClipboardCheck, label: "Inspection", href: "/inspections/new" },
  { icon: Wrench, label: "Maintenance", href: "/maintenance/new" },
  { icon: Banknote, label: "Payment", href: "/billing" },
]

function TileGrid({ tiles, onPick }: Readonly<{ tiles: AddTile[]; onPick: (href: string) => void }>) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onPick(t.href)}
          className="rounded-[var(--r-button)] border border-border bg-card py-4 flex flex-col items-center gap-2 active:scale-95 transition-transform"
        >
          <t.icon className="h-5 w-5 text-brand" />
          <span className="text-[12px] font-medium text-foreground">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

export function MobileQuickAdd({ open, onOpenChange }: MobileQuickAddProps) {
  const router = useRouter()
  const canSee = useNavGate()  // capability + tier — don't offer an add the member can't perform (RBAC P4)
  const addTiles = ADD.filter((t) => canSee(t.href))
  const captureTiles = CAPTURE.filter((t) => canSee(t.href))

  function pick(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl p-0">
        <SheetHeader className="px-4 pt-4 pb-1">
          <SheetTitle className="text-base font-semibold">Quick add</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {addTiles.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Add</p>
              <TileGrid tiles={addTiles} onPick={pick} />
            </div>
          )}
          {captureTiles.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Capture</p>
              <TileGrid tiles={captureTiles} onPick={pick} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
