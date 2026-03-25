import Link from "next/link"
import Image from "next/image"
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
      <footer className="border-t border-border/50 bg-surface">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <Image src="/logo-mark.svg" alt="Pleks" width={28} height={28} className="mb-3 opacity-60" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                SA property management built by someone who has done it for 11 years.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="/for-agents" className="text-muted-foreground hover:text-foreground transition-colors">For Agents</Link></li>
                <li><Link href="/for-landlords" className="text-muted-foreground hover:text-foreground transition-colors">For Landlords</Link></li>
                <li><Link href="/migrate" className="text-muted-foreground hover:text-foreground transition-colors">Migrate</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link></li>
                <li><Link href="/credit-check-policy" className="text-muted-foreground hover:text-foreground transition-colors">Credit Check Policy</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>info@pleks.co.za</li>
                <li>13 Station Street</li>
                <li>Paarl, South Africa</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border/50 pt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo-mark.svg" alt="" width={16} height={16} className="opacity-40" />
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} Pleks. Built in South Africa.
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">Tohi Group PTY LTD</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
