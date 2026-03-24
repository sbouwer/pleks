"use client"

import Link from "next/link"
import { Users, CreditCard, Shield, Wrench } from "lucide-react"

const settingsNav = [
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/compliance", label: "Compliance", icon: Shield },
  { href: "/settings/contractors", label: "Contractors", icon: Wrench },
]

export default function SettingsPage() {
  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Settings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <item.icon className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
