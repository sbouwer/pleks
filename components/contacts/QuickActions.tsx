import { Phone, Mail, MessageCircle, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface QuickActionsProps {
  primaryPhone?: string | null
  primaryEmail?: string | null
  waNumber?: string | null
  moreItems?: Array<{ label: string; onClick?: () => void; href?: string; variant?: "danger" }>
}

function formatWaNumber(phone: string): string {
  const digits = phone.replaceAll(/\D/g, "")
  if (digits.startsWith("0")) {
    return `27${digits.slice(1)}`
  }
  return digits
}

export function QuickActions({ primaryPhone, primaryEmail, waNumber, moreItems = [] }: Readonly<QuickActionsProps>) {
  const waSource = waNumber ?? primaryPhone ?? null
  const waFormatted = waSource ? formatWaNumber(waSource) : null

  return (
    <div className="grid grid-cols-4 gap-1">
      {/* Call */}
      {primaryPhone ? (
        <a
          href={`tel:${primaryPhone}`}
          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface transition-colors text-center"
        >
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Call</span>
        </a>
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg opacity-30 cursor-not-allowed">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Call</span>
        </div>
      )}

      {/* Email */}
      {primaryEmail ? (
        <a
          href={`mailto:${primaryEmail}`}
          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface transition-colors text-center"
        >
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Email</span>
        </a>
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg opacity-30 cursor-not-allowed">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Email</span>
        </div>
      )}

      {/* WhatsApp */}
      {waFormatted ? (
        <a
          href={`https://wa.me/${waFormatted}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface transition-colors text-center"
        >
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">WhatsApp</span>
        </a>
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg opacity-30 cursor-not-allowed">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">WhatsApp</span>
        </div>
      )}

      {/* More */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-surface transition-colors text-center w-full">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">More</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {moreItems.length === 0 ? (
            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
          ) : (
            moreItems.map((item) => (
              <DropdownMenuItem
                key={item.label}
                onClick={item.href ? () => window.open(item.href, "_blank") : item.onClick}
                className={item.variant === "danger" ? "text-danger" : ""}
              >
                {item.label}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
