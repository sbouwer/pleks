import Link from "next/link"
import { formatZAR } from "@/lib/constants"

interface Props {
  schemeName: string | null
  managingAgentCompany: string | null
  schemeId: string | null
  levyCents: number | null
  levyAccount: string | null
}

export function BodyCorporateCard({ schemeName, managingAgentCompany, schemeId, levyCents, levyAccount }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-4 py-3 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
        Body corporate
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {schemeName && (
          <span className="font-medium">
            {schemeId ? (
              <Link href={`/suppliers/${schemeId}`} className="hover:text-brand transition-colors">
                {schemeName}
              </Link>
            ) : schemeName}
          </span>
        )}
        {managingAgentCompany && (
          <span className="text-muted-foreground">{managingAgentCompany}</span>
        )}
        {levyCents != null && levyCents > 0 && (
          <span className="text-muted-foreground">
            Monthly levy: <span className="text-foreground font-medium">{formatZAR(levyCents)}</span>
          </span>
        )}
        {levyAccount && (
          <span className="text-muted-foreground">Account: {levyAccount}</span>
        )}
      </div>
    </div>
  )
}
