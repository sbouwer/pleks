import Link from "next/link"
import { PublicNav } from "./PublicNav"
import { PublicThemeProvider } from "./PublicThemeProvider"
import { FooterColumns } from "@/components/marketing/FooterColumns"
import { AccentBracket } from "@/components/ui/AccentBracket"
import "./public.css"

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <PublicThemeProvider>
      <PublicNav />
      <main>{children}</main>

      <footer className="pub-hairline-t" style={{ background: "var(--paper-sunk)" }}>
        <div className="pub-wrap" style={{ paddingTop: 48, paddingBottom: 48 }}>

          {/* Brand + columns grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "clamp(180px, 30%, 240px) 1fr 1fr 1fr",
            gap: 40,
            marginBottom: 40,
          }}>
            {/* Brand — wordmark matches nav */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Link href="/" className="pub-wordmark" aria-label="Pleks" style={{ alignSelf: "flex-start" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
                <span className="pub-wm-tld">.co.za</span>
              </Link>
              <p className="pub-small" style={{ maxWidth: "28ch", margin: 0 }}>
                Built from the inside out.<br />
                <span style={{ color: "var(--ink-soft)" }}>Every feature earned in the field.</span>
              </p>
              <Link
                href="/early-access"
                className="pub-small"
                style={{ color: "var(--amber-ink)", fontWeight: 500 }}
              >
                Get early access →
              </Link>
            </div>

            <FooterColumns />
          </div>

          {/* Bottom bar */}
          <div className="pub-hairline-t" style={{ paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p className="pub-xs" style={{ margin: 0 }}>
              &copy; {new Date().getFullYear()} Pleks (Pty) Ltd. Built in South Africa.
            </p>
            <a
              href="https://yoros.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="pub-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              Built by Yoros
            </a>
          </div>
        </div>
      </footer>
    </PublicThemeProvider>
  )
}
