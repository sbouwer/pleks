/**
 * app/(help)/layout.tsx — Branded, all-roles shell for the Help Centre (ADDENDUM_68A B11)
 *
 * Route:  wraps /help (and any (help)-group route)
 * Auth:   none added here — the page resolves the session role itself (D-HELP role-agnostic)
 * Notes:  The (help) group is role-agnostic by design (D-HELP) — a tenant must see the same clean
 *         shell as an agent — so this deliberately carries NO agent Sidebar / PortfolioPrefetcher /
 *         MfaGuard. It only provides chrome: the Pleks wordmark + a consistent LIGHT app theme
 *         (`.pleks-portal data-theme="light"`, matching the dashboard/portal surfaces) so /help
 *         stops inheriting the raw dark `:root` and rendering themeless. HelpCentre then renders
 *         just its content (B11 drops its self-rolled shell).
 */
import Link from "next/link"

export default function HelpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="pleks-portal min-h-screen bg-background text-foreground" data-theme="light">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-baseline gap-1 transition-opacity hover:opacity-80" aria-label="Pleks home">
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">pleks</span>
            <span className="font-mono text-[9px] text-muted-foreground">.co.za</span>
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Help Centre</span>
        </div>
      </header>
      {children}
    </div>
  )
}
