/**
 * app/(status)/layout.tsx — Minimal shell for the standalone status subdomain
 *
 * Auth:   public
 * Notes:  Intentionally does NOT inherit the (public) layout. The status page
 *         is served at status.pleks.co.za — all nav links must be absolute so
 *         client-side routing does not trap users on the status subdomain.
 *         Uses PublicThemeProvider so the light theme and data-theme CSS vars
 *         apply correctly (root layout hardcodes class="dark").
 */
import { PublicThemeProvider } from "@/app/(public)/PublicThemeProvider"
import { AccentBracket } from "@/components/ui/AccentBracket"
import "@/app/(public)/public.css"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

export default function StatusLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicThemeProvider>
      <header className="pub-hairline-b" style={{
        padding: "0 40px",
        height: 64,
        display: "flex",
        alignItems: "center",
      }}>
        <a href={MARKETING_URL} className="pub-wordmark" aria-label="Pleks">
          <span className="pub-wm-name">{"plek"}<AccentBracket>{"s"}</AccentBracket></span>
        </a>
      </header>
      <main>{children}</main>
    </PublicThemeProvider>
  )
}
