"use client"

import { Menu, ExternalLink, LogOut, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUser } from "@/hooks/useUser"
import { useOrg } from "@/hooks/useOrg"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface TopbarProps {
  readonly onMenuClick?: () => void
  readonly settingsHref?: string
  readonly visitSiteHref?: string
  readonly visitSiteLabel?: string
}

export function Topbar({
  onMenuClick,
  settingsHref = "/settings",
  visitSiteHref = "/",
  visitSiteLabel = "Visit Site",
}: TopbarProps) {
  const { user } = useUser()
  const { displayName } = useOrg()
  const router = useRouter()

  const fullName = user?.user_metadata?.full_name as string | undefined
  const emailInitials = user?.email ? user.email.substring(0, 2).toUpperCase() : "?"
  const initials = fullName
    ? fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : emailInitials

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <header className="flex items-center justify-between h-16 px-4 lg:px-6 border-b border-border bg-card">
      {/* Left: mobile menu + org name */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        {displayName && (
          <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
            {displayName}
          </span>
        )}
      </div>

      {/* Right: visit site + profile */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="hidden sm:inline-flex bg-brand text-primary-foreground hover:bg-brand-hover"
          render={<a href={visitSiteHref} target="_blank" rel="noopener noreferrer" />}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {visitSiteLabel}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-brand/10 text-brand text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              {fullName && <p className="text-sm font-medium">{fullName}</p>}
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(settingsHref)}>
              <UserCircle className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
