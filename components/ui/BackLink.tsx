/**
 * components/ui/BackLink.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

interface BackLinkProps {
  href: string
  label: string
}

export function BackLink({ href, label }: Readonly<BackLinkProps>) {
  return (
    <div className="mb-5">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {label}
      </Link>
    </div>
  )
}
