/**
 * components/legal/ExtLink.tsx — branded external link pill for legal documents
 *
 * Auth:   public
 * Notes:  Renders as a pill with ↗ indicator (via CSS ::after). All href values
 *         must come from lib/external-links.ts so the daily cron can verify them.
 */

interface Props {
  readonly href: string
  readonly children: React.ReactNode
}

export function ExtLink({ href, children }: Props) {
  return (
    <a href={href} className="ext-link" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
