"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

const NAV_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/for-agents", label: "For Agents" },
  { href: "/for-landlords", label: "For Landlords" },
  { href: "/migrate", label: "Migrate" },
]

export function PublicNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
      <nav className="max-w-6xl mx-auto px-4 h-16 grid grid-cols-[auto_1fr_auto] items-center">
        {/* Left: logo */}
        <Link href="/" className="shrink-0">
          <Image src="/logo.svg" alt="Pleks" width={90} height={28} className="h-auto" priority />
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
          <Button size="sm" variant="outline" render={<Link href="/register" />}>
            Start free
          </Button>
        </div>

        {/* Right: sign in + mobile hamburger */}
        <div className="flex items-center justify-end gap-3">
          <Button size="sm" className="hidden md:inline-flex" render={<Link href="/login" />}>
            Sign in
          </Button>
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
            <Button variant="outline" className="w-full" render={<Link href="/register" />}>
              Start free
            </Button>
            <Button className="w-full" render={<Link href="/login" />}>
              Sign in
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
