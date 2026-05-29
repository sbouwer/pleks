"use client"

/**
 * app/(public)/PublicNav.tsx — sticky top nav for the public marketing site
 *
 * Auth:   public; reads auth session to show profile or sign-in icon
 * Notes:  Hash links use IntersectionObserver scroll-spy for active state.
 *         /contact highlights when on that path.
 *         Nav hides on scroll-down on mobile (scroll-up reveals it).
 */

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { Menu, User, LogIn, LogOut, LayoutDashboard, Sun, Moon } from "lucide-react"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { createClient } from "@/lib/supabase/client"
import { usePublicTheme } from "./PublicThemeProvider"
import { Sheet, SheetContent } from "@/components/ui/sheet"

// Cross-subdomain links use absolute URLs — relative paths would be RSC-prefetched
// as same-origin, hit the apex→app redirect, and fail the browser's CORS preflight.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

// href is the absolute destination (always cross-origin-safe via MARKETING_URL);
// section is the homepage anchor ID used for scroll-spy (null for non-hash routes).
// Decoupled so we can render plain <a> with an absolute URL while still driving
// the active-state highlight from the IntersectionObserver on the marketing page.
const NAV_LINKS = [
  { href: `${MARKETING_URL}/#why`,       section: "why",      label: "Why Pleks" },
  { href: `${MARKETING_URL}/#artefact`,  section: "artefact", label: "The work" },
  { href: `${MARKETING_URL}/#charter`,   section: "charter",  label: "Charter" },
  { href: `${MARKETING_URL}/#story`,     section: "story",    label: "Who built this" },
  { href: `${MARKETING_URL}/#pricing`,   section: "pricing",  label: "Pricing" },
  { href: `${MARKETING_URL}/#founding`,  section: "founding", label: "Founding agents" },
  { href: `${MARKETING_URL}/contact`,    section: null,       label: "Contact" },
]

// Section IDs for scroll-spy
const SECTION_IDS = NAV_LINKS
  .map(l => l.section)
  .filter((s): s is string => s !== null)

// Shared style for all icon-only buttons in the nav lives in public.css as `.pub-icon-btn`
// (theme toggle, sign-in, profile). Use `.pub-icon-btn--active` for the logged-in state.

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
  const [scrollHidden, setScrollHidden]   = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const lastScrollRef                     = useRef(0)
  const { theme, toggle }                 = usePublicTheme()
  const pathname                          = usePathname()

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

  // Scroll-spy: highlight nav link matching the section in view
  useEffect(() => {
    if (pathname !== "/") { setActiveSection(null); return }
    const visibleRatio = new Map<string, number>()
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) { visibleRatio.set(entry.target.id, entry.intersectionRatio) }
        let topId: string | null = null
        let topRatio = 0
        for (const [id, ratio] of visibleRatio) { if (ratio > topRatio) { topRatio = ratio; topId = id } }
        setActiveSection(topRatio > 0 ? topId : null)
      },
      { threshold: [0, 0.1, 0.25, 0.5], rootMargin: "-64px 0px 0px 0px" },
    )
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pathname])

  const desktopAuthIcon = (() => {
    if (user === undefined) {
      return (
        <span className="pub-icon-btn hidden md:flex" aria-hidden="true" style={{ visibility: "hidden" }}>
          <LogIn size={15} />
        </span>
      )
    }
    if (user) {
      return (
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setProfileOpen(p => !p)}
            className="pub-icon-btn pub-icon-btn--active"
            aria-label="Account menu"
          >
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
                <a href={`${APP_URL}/dashboard`}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--ink)" }}
                  onClick={() => setProfileOpen(false)}>
                  <LayoutDashboard size={14} style={{ color: "var(--ink-mute)" }} /> Dashboard
                </a>
                <button type="button" onClick={handleLogout}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--critical)", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                  <LogOut size={14} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      )
    }
    return (
      <a href={`${APP_URL}/login`} className="pub-icon-btn hidden md:flex" aria-label="Sign in">
        <LogIn size={15} />
      </a>
    )
  })()

  const mobileAuthSection = (() => {
    if (user === undefined) {
      return (
        <>
          <span className="btn-pleks ghost" style={{ visibility: "hidden", justifyContent: "center" }}>placeholder</span>
          <span className="btn-pleks" style={{ visibility: "hidden", justifyContent: "center" }}>placeholder</span>
        </>
      )
    }
    if (user) {
      return (
        <>
          <p className="pub-xs" style={{ padding: "0 8px", margin: 0 }}>{user.email}</p>
          <a href={`${APP_URL}/dashboard`}
            style={{ padding: "10px 8px", fontSize: 14, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}
            onClick={() => setMobileOpen(false)}>
            <LayoutDashboard size={16} /> Dashboard
          </a>
          <button type="button" onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 8px", fontSize: 14, color: "var(--critical)", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
            <LogOut size={16} /> Log out
          </button>
        </>
      )
    }
    return (
      <>
        <a href={`${APP_URL}/login`} className="btn-pleks ghost" style={{ justifyContent: "center" }}>
          <LogIn size={15} /> Sign in
        </a>
        <a href={`${APP_URL}/onboarding`} className="btn-pleks" style={{ justifyContent: "center" }}>
          Start free
        </a>
      </>
    )
  })()

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
        <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks" style={{ flexShrink: 0 }}>
          <span className="pub-wm-name">
            {"plek"}<AccentBracket>{"s"}</AccentBracket>
          </span>
        </a>

        {/* Centre nav — desktop only */}
        <nav aria-label="Site sections" className="hidden md:flex" style={{ flex: 1, justifyContent: "center", gap: 2, alignItems: "center" }}>
          {NAV_LINKS.map(link => {
            const isActive = link.section ? activeSection === link.section : pathname === "/contact"
            return (
              <a
                key={link.href}
                href={link.href}
                className={isActive ? "stoep" : undefined}
                style={{
                  fontSize: 13.5, fontWeight: 500,
                  color: isActive ? "var(--ink)" : "var(--ink-soft)",
                  padding: isActive ? "6px 11px 4px" : "6px 11px",
                  borderRadius: "var(--r-sm)",
                  transition: "color .15s, background .15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--amber-ink)"; e.currentTarget.style.background = "var(--amber-wash)" }}
                onMouseLeave={e => { e.currentTarget.style.color = isActive ? "var(--ink)" : "var(--ink-soft)"; e.currentTarget.style.background = "transparent" }}
              >
                {link.label}
              </a>
            )
          })}
          {/* Start free CTA — only shown when confirmed logged out, not while checking */}
          {user === null && (
            <a
              href={`${APP_URL}/onboarding`}
              className="btn-pleks"
              style={{ fontSize: 13, marginLeft: 8 }}
            >
              Start free
            </a>
          )}
        </nav>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            className="pub-icon-btn"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Auth icon — three-state: checking / logged-in / logged-out (computed above) */}
          {desktopAuthIcon}

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
              <a key={link.href} href={link.href}
                style={{ padding: "11px 8px", fontSize: 14, fontWeight: 500, color: "var(--ink-soft)", borderRadius: "var(--r-sm)" }}
                onClick={() => setMobileOpen(false)}>
                {link.label}
              </a>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
            <button type="button" onClick={toggle}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", fontSize: 14, color: "var(--ink-soft)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            {mobileAuthSection}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
