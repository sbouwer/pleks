/**
 * app/(dashboard)/settings/privacy/page.tsx — Privacy & POPIA settings landing
 *
 * Route:  /settings/privacy
 * Auth:   gatewaySSR() — org member
 * Data:   none — nav-only page
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronRight, Inbox, BarChart2, Clock, User, Shield } from "lucide-react"

export const metadata = { title: "Privacy & POPIA" }

const NAV_ITEMS = [
  {
    href: "/settings/privacy/data-subject-requests",
    icon: Inbox,
    label: "Data subject requests",
    description: "Review and respond to POPIA right-exercise requests",
  },
  {
    href: "/settings/privacy/compliance-dashboard",
    icon: BarChart2,
    label: "Compliance dashboard",
    description: "Open requests, SLA health, retention purge history",
  },
  {
    href: "/settings/privacy/retention",
    icon: Clock,
    label: "Data retention",
    description: "Retention periods by data category and legal basis",
  },
  {
    href: "/settings/privacy/information-officer",
    icon: User,
    label: "Information Officer",
    description: "Your organisation's designated POPIA Information Officer",
  },
  {
    href: "/settings/privacy/my-data",
    icon: Shield,
    label: "My data & privacy",
    description: "Your personal POPIA rights across all Pleks controllers",
  },
]

export default async function PrivacySettingsPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl mb-1">Privacy &amp; POPIA</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organisation&apos;s POPIA obligations — data subject requests, retention
          enforcement, and compliance monitoring.
        </p>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {NAV_ITEMS.map(({ href, icon: Icon, label, description }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 px-4 py-4 hover:bg-muted/50 transition-colors"
            >
              <Icon className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
