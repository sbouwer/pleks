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
import { Wordmark } from "@/components/ui/Wordmark"
import "@/app/(public)/public.css"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"

// Suppress manifest link — status.pleks.co.za is a different origin from
// the manifest's start_url (app.pleks.co.za). Browser ignores start_url + logs warning.
export const metadata = { manifest: null }

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
        <Wordmark href={MARKETING_URL} external />
      </header>
      <main>{children}</main>
    </PublicThemeProvider>
  )
}
