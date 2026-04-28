/**
 * components/contacts/ContactDetailLayout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

interface ContactDetailLayoutProps {
  breadcrumb: { label: string; href: string }
  sidebar: React.ReactNode
  children: React.ReactNode
}

export function ContactDetailLayout({ breadcrumb, sidebar, children }: Readonly<ContactDetailLayoutProps>) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={breadcrumb.href}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {breadcrumb.label}
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <aside className="lg:sticky lg:top-6">{sidebar}</aside>
        <main className="space-y-4 min-w-0">{children}</main>
      </div>
    </div>
  )
}
