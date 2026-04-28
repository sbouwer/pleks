/**
 * app/(public)/early-access/layout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
export const metadata = {
  title: "Get Early Access | Pleks Property Management",
  description:
    "Join the Pleks waitlist for founding agent pricing. SA property management launching in Paarl.",
}

export default function EarlyAccessLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
