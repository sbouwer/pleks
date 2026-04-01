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
