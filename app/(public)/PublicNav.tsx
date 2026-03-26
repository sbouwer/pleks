"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X, User, LogOut, LayoutDashboard } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const NAV_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/for-agents", label: "For Agents" },
  { href: "/for-landlords", label: "For Landlords" },
  { href: "/migrate", label: "Migrate" },
]

export function PublicNav() {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        setUser(data.user ? { email: data.user.email ?? undefined } : null)
      })
      .catch(() => {
        setUser(null)
      })
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    globalThis.location.href = "/"
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
      <nav className="max-w-6xl mx-auto px-4 h-16 grid grid-cols-[auto_1fr_auto] items-center">
        {/* Left: logo */}
        <Link href="/" className="shrink-0">
          <Image src="/logo.svg" alt="Pleks" width={90} height={28} className="h-7 w-auto" priority />
        </Link>

        {/* Centre: nav links + Start free */}
        <div className="hidden md:flex items-center justify-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {!user && (
            <Button size="sm" variant="outline" render={<Link href="/onboarding" />}>
              Start free
            </Button>
          )}
        </div>

        {/* Right: auth state */}
        <div className="flex items-center justify-end gap-3">
          {user ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center justify-center size-8 rounded-full bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                aria-label="Account menu"
              >
                <User className="size-4" />
              </button>
              {profileOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setProfileOpen(false)} aria-label="Close menu" />
                  <div className="absolute right-0 top-10 z-50 w-52 rounded-lg border border-border bg-popover shadow-lg py-1">
                    <p className="px-3 py-2 text-xs text-muted-foreground truncate border-b border-border/50">
                      {user.email}
                    </p>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-elevated transition-colors"
                      onClick={() => setProfileOpen(false)}
                    >
                      <LayoutDashboard className="size-4 text-muted-foreground" />
                      Dashboard
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-elevated transition-colors w-full text-left text-danger"
                    >
                      <LogOut className="size-4" />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button size="sm" className="hidden md:inline-flex" render={<Link href="/login" />}>
              Sign in
            </Button>
          )}
          <button
            className="md:hidden p-2 -mr-2"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/30 bg-background px-4 pb-4">
          <div className="flex flex-col gap-1 py-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
            {user ? (
              <>
                <p className="text-xs text-muted-foreground px-1 mb-1">{user.email}</p>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 py-2 text-sm hover:text-foreground transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <LayoutDashboard className="size-4" />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 py-2 text-sm text-danger text-left"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Button variant="outline" className="w-full" render={<Link href="/onboarding" />}>
                  Start free
                </Button>
                <Button className="w-full" render={<Link href="/login" />}>
                  Sign in
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
