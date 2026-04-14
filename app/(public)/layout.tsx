import Link from "next/link"
import Image from "next/image"
import { PublicNav } from "./PublicNav"
import { FooterColumns } from "@/components/marketing/FooterColumns"

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border/40 bg-surface">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-0 md:gap-10 mb-10">
            {/* Brand — always visible */}
            <div className="space-y-4 pb-6 md:pb-0 border-b border-border/30 md:border-none">
              <Image src="/logo.svg" alt="Pleks" width={100} height={32} className="h-8 w-auto opacity-90" />
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

            {/* Product / Legal / Contact — accordion on mobile, columns on desktop */}
            <FooterColumns />
          </div>

          {/* Bottom bar */}
          <div className="border-t border-border/30 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Pleks (Pty) Ltd. Built in South Africa.
            </p>
            <a
              href="https://yoros.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Built by Yoros
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
