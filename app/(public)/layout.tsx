/**
 * app/(public)/layout.tsx — shell for all public marketing and legal pages
 *
 * Auth:  none — fully public
 * Notes: Imports both public.css and action-language.css so ActionButton
 *        (pa-primary / pa-secondary) works on public pages.
 */
import { PublicNav } from "./PublicNav"
import { PublicThemeProvider } from "./PublicThemeProvider"
import { FooterColumns } from "@/components/marketing/FooterColumns"
import { StatusWidget } from "@/components/marketing/StatusWidget"
import { AccentBracket } from "@/components/ui/AccentBracket"
import "./public.css"
import "@/components/ui/actions/action-language.css"

// PWA manifest is app.pleks.co.za only — suppress on marketing pages to avoid
// the "start_url ignored, should be same origin" browser console warning.
export const metadata = { manifest: null }

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

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
              <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks" style={{ alignSelf: "flex-start" }}>
                <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
              </a>
              <p className="pub-small" style={{ maxWidth: "28ch", margin: 0 }}>
                Built from the inside out.<br />
                <span style={{ color: "var(--ink-soft)" }}>Every feature earned in the field.</span>
              </p>
              <div style={{ flex: 1 }} />
              <StatusWidget />
              <div style={{ flex: 1 }} />
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
