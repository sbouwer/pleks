"use client"

/**
 * components/marketing/FooterColumns.tsx — three-column footer link grid
 *
 * Notes:  Collapsible on mobile (accordion); always visible on desktop.
 *         Product column links match NAV_LINKS in PublicNav.tsx — keep in sync.
 */
import { useState } from "react"
import { Mail, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Absolute URLs — footer renders on app.pleks.co.za/login (and other app-subdomain
// pages via the public layout). Relative apex-path Links would RSC-prefetch cross-origin.
const M = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

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
              <a href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {item.label}
              </a>
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
          { label: "Why Pleks",       href: `${M}/#why` },
          { label: "The work",        href: `${M}/#artefact` },
          { label: "Charter",         href: `${M}/#charter` },
          { label: "Pricing",         href: `${M}/#pricing` },
          { label: "Founding agents", href: `${M}/#founding` },
          { label: "Contact",         href: `${M}/contact` },
        ]}
      />
      <FooterSection
        title="Legal"
        items={[
          { label: "Cookie Policy",        href: `${M}/cookie-policy` },
          { label: "Credit Check Policy",  href: `${M}/credit-check-policy` },
          { label: "Definitions",          href: `${M}/definitions` },
          { label: "PAIA Manual",          href: `${M}/paia-manual` },
          { label: "POPIA Register",       href: `${M}/popia-register` },
          { label: "Privacy Policy",       href: `${M}/privacy` },
          { label: "Terms of Service",     href: `${M}/terms` },
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
