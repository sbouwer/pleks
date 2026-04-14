"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface TextItem { label: string; href: string; type?: "link" }
interface MailItem { label: string; mailto: string; type: "mail" }
type FooterItem = TextItem | MailItem

interface SectionProps {
  title: string
  items: FooterItem[]
}

function FooterSection({ title, items }: SectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:block">
      {/* Section header — tappable on mobile, static on desktop */}
      <button
        type="button"
        className="flex items-center justify-between w-full py-3 md:py-0 md:cursor-default border-b border-border/30 md:border-none"
        onClick={() => setOpen((o) => !o)}
      >
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h4>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground md:hidden transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Items — toggle on mobile, always visible on desktop */}
      <ul
        className={cn(
          "space-y-2.5 text-sm overflow-hidden transition-all duration-200 md:block md:mt-4",
          open ? "max-h-96 pt-3 pb-2" : "max-h-0 md:max-h-none"
        )}
      >
        {items.map((item) => {
          if ("mailto" in item) {
            return (
              <li key={item.mailto}>
                <a
                  href={`mailto:${item.mailto}`}
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
                >
                  <Mail className="size-3.5 shrink-0" />
                  {item.mailto}
                </a>
              </li>
            )
          }
          return (
            <li key={item.href}>
              <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function FooterColumns() {
  return (
    <>
      <FooterSection
        title="Product"
        items={[
          { label: "Pricing", href: "/pricing" },
          { label: "For Agents", href: "/for-agents" },
          { label: "For Landlords", href: "/for-landlords" },
          { label: "Switch to Pleks", href: "/migrate" },
          { label: "Early access", href: "/early-access" },
        ]}
      />
      <FooterSection
        title="Legal"
        items={[
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Service", href: "/terms" },
          { label: "Credit Check Policy", href: "/credit-check-policy" },
        ]}
      />
      <FooterSection
        title="Contact"
        items={[
          { type: "mail", label: "hello", mailto: "hello@pleks.co.za" },
          { type: "mail", label: "support", mailto: "support@pleks.co.za" },
          { type: "mail", label: "legal", mailto: "legal@pleks.co.za" },
        ]}
      />
    </>
  )
}
