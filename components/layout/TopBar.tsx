"use client"

/**
 * components/layout/TopBar.tsx — sticky dashboard header: org name, global search, role/theme/site/profile actions
 *
 * Notes:  Hidden on mobile /dashboard (MobileHomeScreen renders its own header); right padding tracks <main>'s scrollbar
 *         width so icons align with content. Profile menu closes on outside click/Escape (no fixed backdrop — see comment).
 */

import { useState, useRef, useEffect } from "react"
import { ExternalLink, LogOut, Moon, Sun, User, UserCircle } from "lucide-react"
import { GlobalSearch } from "@/components/layout/GlobalSearch"
import { SyncIndicator } from "@/components/layout/SyncIndicator"
import { usePortalTheme } from "@/components/layout/PortalThemeProvider"
import { useUser } from "@/hooks/useUser"
import { useOrg } from "@/hooks/useOrg"
import { useRouter, usePathname } from "next/navigation"
import { RoleSwitcher } from "@/components/role-switcher/RoleSwitcher"
import { SubscriptionStateBell } from "@/components/layout/SubscriptionStateBell"
import { DevTierToggle } from "@/components/dev/DevTierToggle"  // DEV-ONLY — remove before launch

interface TopbarProps {
  readonly settingsHref?: string
  readonly visitSiteHref?: string
  readonly visitSiteLabel?: string
}

export function Topbar({
  settingsHref = "/settings",
  visitSiteHref = "/",
  visitSiteLabel = "Visit site",
}: TopbarProps) {
  const { user } = useUser()
  const { displayName } = useOrg()
  const { theme, toggle } = usePortalTheme()
  const router = useRouter()
  const pathname = usePathname()
  // The mobile /dashboard renders its own greeting header (MobileHomeScreen), so the desktop Topbar
  // would stack as a second header there. Hide it on mobile for that one route; keep it everywhere else.
  const hiddenOnMobile = pathname === "/dashboard"
  const [profileOpen, setProfileOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // When <main> scrolls, its scrollbar insets the page content on the right. Push the header right by
  // that width (0 when there's no scrollbar) so the icons stay aligned with the content. Re-measured on
  // resize / content changes (a scrollbar appearing changes main's clientWidth).
  const [scrollbarWidth, setScrollbarWidth] = useState(0)
  useEffect(() => {
    const main = document.querySelector("main")
    if (!main) return
    const measure = () => setScrollbarWidth(main.offsetWidth - main.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(main)
    return () => ro.disconnect()
  }, [])

  // Close the profile menu on any outside click or Escape. A fixed backdrop element does NOT work
  // here: the header's backdrop-filter makes it the containing block for position:fixed children, so
  // an inset-0 backdrop only covers the 64px header, never the rest of the screen.
  useEffect(() => {
    if (!profileOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setProfileOpen(false) }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onEsc)
    }
  }, [profileOpen])

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <header className={hiddenOnMobile ? "hidden lg:flex" : "flex"} style={{
      position: "sticky", top: 0, zIndex: 40,
      // Match the page surface (bg-muted/30) so the header reads as one continuous canvas —
      // the icons/search carry their own raised fill instead. Token-driven → works light + dark.
      background: "color-mix(in oklab, var(--muted) 30%, var(--background))",
      borderBottom: "1px solid var(--rule)",
      height: 64, alignItems: "center",
      // Match the main content padding (24px) + the scroll content's scrollbar width on the right, so the
      // org name / icons line up with the page content whether or not <main> is scrolling.
      padding: `0 ${24 + scrollbarWidth}px 0 24px`, gap: 16, flexShrink: 0,
    }}>

      {/* Left: org name */}
      <span className="hidden sm:inline" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-mute)" }}>
        {displayName}
      </span>

      {/* DEV-ONLY tier switcher — renders only for the dev account; remove before launch */}
      <DevTierToggle />

      {/* Centre: global search — desktop only */}
      <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex">
        <GlobalSearch />
      </div>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <RoleSwitcher />
        <SyncIndicator />
        <SubscriptionStateBell />

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="pa-iconbtn"
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Visit site */}
        <a
          href={visitSiteHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pa-iconbtn hidden sm:flex"
          aria-label={visitSiteLabel}
          title={visitSiteLabel}
        >
          <ExternalLink size={15} />
        </a>

        {/* Profile */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setProfileOpen(p => !p)}
            className="pa-iconbtn"
            aria-label="Account menu"
            title="Account"
          >
            <User size={15} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-[42px] z-50 min-w-[200px] overflow-hidden rounded-[var(--r-button)] border border-border bg-popover shadow-lg">
              <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                {user?.email}
              </p>
              <button
                type="button"
                onClick={() => { setProfileOpen(false); router.push(settingsHref) }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
              >
                <UserCircle size={14} className="text-muted-foreground" />
                Settings
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-destructive transition-colors hover:bg-muted"
              >
                <LogOut size={14} />
                Sign out
              </button>
              {/* amber doorsill */}
              <div aria-hidden className="h-1 w-full bg-primary" />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
