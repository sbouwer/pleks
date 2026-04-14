"use client"

import { useRouter } from "next/navigation"
import { Banknote, Wrench, UserPlus, Phone } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface MobileQuickAddProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface QuickAction {
  icon: React.ElementType
  label: string
  href: string | null
}

const ACTIONS: QuickAction[] = [
  { icon: Banknote, label: "Record a payment", href: "/payments" },
  { icon: Wrench, label: "Log maintenance", href: "/maintenance/new" },
  { icon: UserPlus, label: "Add a tenant", href: "/tenants" },
  { icon: Phone, label: "Log a phone call", href: null },
]

export function MobileQuickAdd({ open, onOpenChange }: MobileQuickAddProps) {
  const router = useRouter()

  function handleAction(href: string | null) {
    onOpenChange(false)
    if (href) router.push(href)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-base font-semibold">Quick actions</SheetTitle>
        </SheetHeader>

        <div className="pb-4">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => handleAction(action.href)}
              className="w-full py-4 px-4 flex items-center gap-4 text-sm font-medium border-b border-border/50 active:bg-muted transition-colors"
            >
              <action.icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <span>{action.label}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full py-4 px-4 text-sm font-medium text-muted-foreground active:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
