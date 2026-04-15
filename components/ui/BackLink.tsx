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
