"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Menu, User, LogIn, LogOut, LayoutDashboard, Sun, Moon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { usePublicTheme } from "./PublicThemeProvider"
import { Sheet, SheetContent } from "@/components/ui/sheet"

const NAV_LINKS = [
  { href: "/#why",       label: "Why Pleks" },
  { href: "/#artefact",  label: "The work" },
  { href: "/#charter",   label: "Charter" },
  { href: "/#story",     label: "Who built this" },
  { href: "/#pricing",   label: "Pricing" },
  { href: "/#founding",  label: "Founding agents" },
]

// Shared style for all icon-only buttons in the nav (theme toggle, sign-in, profile)
const ICON_BTN: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 34, height: 34, flexShrink: 0,
  borderRadius: "var(--r-sm)", border: "1px solid var(--rule)",
  background: "var(--paper-sunk)", color: "var(--ink-mute)",
  cursor: "pointer", transition: "all .15s",
}

async function handleLogout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  globalThis.location.href = "/"
}

export function PublicNav() {
  const [mobileOpen, setMobileOpen]     = useState(false)
  const [profileOpen, setProfileOpen]   = useState(false)
  // undefined = checking; null = logged out; object = logged in
  const [user, setUser]                 = useState<{ email?: string } | null | undefined>(undefined)
  const [scrollHidden, setScrollHidden] = useState(false)
  const lastScrollRef                   = useRef(0)
  const { theme, toggle }               = usePublicTheme()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => setUser(data.user ? { email: data.user.email ?? undefined } : null))
      .catch(() => setUser(null))
  }, [])

  // Hide nav on scroll-down on mobile only
  useEffect(() => {
    const handleScroll = () => {
      if (globalThis.innerWidth >= 768) return
      const current = globalThis.scrollY
      setScrollHidden(current > lastScrollRef.current && current > 64)
      lastScrollRef.current = current
    }
    globalThis.addEventListener("scroll", handleScroll, { passive: true })
    return () => globalThis.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 40,
        background: "color-mix(in oklch, var(--paper) 92%, transparent)",
        backdropFilter: "saturate(140%) blur(8px)",
        borderBottom: "1px solid var(--rule)",
        transition: "transform 300ms",
        transform: scrollHidden ? "translateY(-100%)" : "translateY(0)",
      }}
    >
      <div className="pub-wrap" style={{ height: 64, display: "flex", alignItems: "center", gap: 24 }}>

        {/* Wordmark */}
        <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ flexShrink: 0 }}>
          {"pl"}<span className="pub-wm-e">{"e"}<span className="pub-wm-cut" aria-hidden="true" /></span>{"ks"}
          <span className="pub-wm-tld">.co.za</span>
        </Link>

        {/* Centre nav — desktop only */}
        <nav aria-label="Site sections" className="hidden md:flex" style={{ flex: 1, justifyContent: "center", gap: 2, alignItems: "center" }}>
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontSize: 13.5, fontWeight: 500, color: "var(--ink-soft)",
                padding: "6px 11px", borderRadius: "var(--r-sm)",
                transition: "color .15s, background .15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--ink)"; e.currentTarget.style.background = "var(--paper-sunk)" }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-soft)"; e.currentTarget.style.background = "transparent" }}
            >
              {link.label}
            </Link>
          ))}
          {/* Start free CTA — sits right after the last nav link, hidden when logged in */}
          {!user && (
            <Link
              href="/onboarding"
              className="pub-btn pub-btn-primary"
              style={{ padding: "7px 14px", fontSize: 13, fontWeight: 600, marginLeft: 8 }}
            >
              Start free
            </Link>
          )}
        </nav>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>

          {/* Theme toggle */}
          <button type="button" onClick={toggle} style={ICON_BTN}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Auth icon — same size/style as theme toggle, only icon changes */}
          {user ? (
            /* Logged in: User icon opens profile dropdown */
            <div className="relative hidden md:block">
              <button type="button" onClick={() => setProfileOpen(p => !p)}
                style={{ ...ICON_BTN, color: "var(--amber-ink)", borderColor: "oklch(0.68 0.14 65 / 0.35)" }}
                aria-label="Account menu">
                <User size={15} />
              </button>
              {profileOpen && (
                <>
                  <button type="button" aria-label="Close"
                    style={{ position: "fixed", inset: 0, zIndex: 40, cursor: "default", background: "transparent", border: "none" }}
                    onClick={() => setProfileOpen(false)}
                  />
                  <div style={{
                    position: "absolute", right: 0, top: 42, zIndex: 50, width: 200,
                    borderRadius: "var(--r-md)", border: "1px solid var(--rule)",
                    background: "var(--paper-raised)", boxShadow: "var(--shadow-2)", padding: "4px 0",
                  }}>
                    <p className="pub-xs" style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule)", margin: 0 }}>
                      {user.email}
                    </p>
                    <Link href="/dashboard"
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--ink)" }}
                      onClick={() => setProfileOpen(false)}>
                      <LayoutDashboard size={14} style={{ color: "var(--ink-mute)" }} /> Dashboard
                    </Link>
                    <button type="button" onClick={handleLogout}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--critical)", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                      <LogOut size={14} /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Logged out (or checking): LogIn icon — same bordered style, no text */
            <Link href="/login" className="hidden md:flex" style={ICON_BTN} aria-label="Sign in">
              <LogIn size={15} />
            </Link>
          )}

          {/* Hamburger — mobile only */}
          <button className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"
            style={{ padding: 8, background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}>
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "16px 0" }}>
            {NAV_LINKS.map(link => (
              <Link key={link.href} href={link.href}
                style={{ padding: "11px 8px", fontSize: 14, fontWeight: 500, color: "var(--ink-soft)", borderRadius: "var(--r-sm)" }}
                onClick={() => setMobileOpen(false)}>
                {link.label}
              </Link>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
            <button type="button" onClick={toggle}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", fontSize: 14, color: "var(--ink-soft)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            {user ? (
              <>
                <p className="pub-xs" style={{ padding: "0 8px", margin: 0 }}>{user.email}</p>
                <Link href="/dashboard"
                  style={{ padding: "10px 8px", fontSize: 14, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}
                  onClick={() => setMobileOpen(false)}>
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
                <button type="button" onClick={handleLogout}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 8px", fontSize: 14, color: "var(--critical)", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                  <LogOut size={16} /> Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="pub-btn pub-btn-ghost" style={{ justifyContent: "center", gap: 8 }}>
                  <LogIn size={15} /> Sign in
                </Link>
                <Link href="/onboarding" className="pub-btn pub-btn-primary" style={{ justifyContent: "center" }}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
