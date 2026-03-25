import Link from "next/link"
import Image from "next/image"
import { Mail, MapPin } from "lucide-react"
import { PublicNav } from "./PublicNav"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/40 bg-surface">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10 mb-10">
            {/* Brand */}
            <div className="space-y-4">
              <Image src="/logo.svg" alt="Pleks" width={100} height={32} className="h-auto opacity-90" />
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                Built from the inside out.
                <br />
                <span className="text-foreground/70">Every feature earned in the field.</span>
              </p>
              <Link
                href="/early-access"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand/80 transition-colors font-medium"
              >
                Get early access →
              </Link>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm">
                {[
                  { label: "Pricing", href: "/pricing" },
                  { label: "For Agents", href: "/for-agents" },
                  { label: "For Landlords", href: "/for-landlords" },
                  { label: "Migrate from TPN", href: "/migrate" },
                  { label: "Early access", href: "/early-access" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4">Legal</h4>
              <ul className="space-y-2.5 text-sm">
                {[
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms of Service", href: "/terms" },
                  { label: "Credit Check Policy", href: "/credit-check-policy" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4">Contact</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="mailto:info@pleks.co.za" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0" />
                    info@pleks.co.za
                  </a>
                </li>
                <li>
                  <a href="mailto:support@pleks.co.za" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0" />
                    support@pleks.co.za
                  </a>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  Paarl, South Africa
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Pleks (Pty) Ltd. Built in South Africa.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Powered by</span>
              <a
                href="https://yoros.co.za"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium underline underline-offset-2"
              >
                Yoros
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
