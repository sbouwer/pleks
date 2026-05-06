/**
 * app/(status)/layout.tsx — Minimal shell for the standalone status subdomain
 *
 * Auth:   public
 * Notes:  Intentionally does NOT inherit the (public) layout. The status page
 *         is served at status.pleks.co.za — all nav links must be absolute so
 *         client-side routing does not trap users on the status subdomain.
 *         Imports public.css for CSS custom properties (--ink, --rule, etc.).
 */
import "@/app/(public)/public.css"

export default function StatusLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header style={{
        borderBottom: "1px solid var(--rule, #ddd9d0)",
        padding: "0 40px",
        height: 52,
        display: "flex",
        alignItems: "center",
      }}>
        <a
          href="https://pleks.co.za"
          style={{
            fontFamily: "var(--pub-heading, var(--font-plus-jakarta, sans-serif))",
            fontWeight: 800,
            fontSize: 17,
            letterSpacing: "-0.5px",
            color: "var(--ink, #1a1a18)",
            textDecoration: "none",
          }}
        >
          pleks
        </a>
      </header>
      <main>{children}</main>
    </>
  )
}
