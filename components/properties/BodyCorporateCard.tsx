/**
 * components/properties/BodyCorporateCard.tsx — owner-view summary of a property's managing scheme
 *
 * Auth:   presentational; rendered inside gateway-protected property surfaces
 * Data:   fed by SinglePropertyView from properties.managing_scheme_id → managing_schemes (scheme
 *         name + monthly levy).
 * Notes:  The scheme name used to link to /suppliers/{id} (contractors-era). Removed in ADDENDUM_18B:
 *         managing_scheme_id is a managing_schemes id, not a supplier id, so that link was invalid.
 *         The broader contractors-as-managing_scheme surface consolidation is tracked as T-18B-5.
 */
import { formatZAR } from "@/lib/constants"

interface Props {
  schemeName: string | null
  managingAgentCompany: string | null
  levyCents: number | null
  levyAccount: string | null
}

export function BodyCorporateCard({ schemeName, managingAgentCompany, levyCents, levyAccount }: Props) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-4 py-3 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
        Body corporate
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {schemeName && (
          <span className="font-medium">{schemeName}</span>
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
