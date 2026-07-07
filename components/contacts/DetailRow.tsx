/**
 * components/contacts/DetailRow.tsx — label/value row for detail panels (label left, value right-aligned)
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
