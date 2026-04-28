/**
 * components/contacts/DetailRow.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
interface DetailRowProps {
  label: string
  children: React.ReactNode
}

export function DetailRow({ label, children }: Readonly<DetailRowProps>) {
  return (
    <div className="flex justify-between items-start py-1.5 text-sm">
      <span className="text-muted-foreground shrink-0 mr-3">{label}</span>
      <span className="text-right break-words">{children}</span>
    </div>
  )
}
