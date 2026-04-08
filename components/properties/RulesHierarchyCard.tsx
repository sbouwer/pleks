import Link from "next/link"

export function RulesHierarchyCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
        Where other lease rules live
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Property rules (above) apply to all units in this property and appear as an annexure in the
        lease.
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        Two other levels of configuration affect your leases:
      </p>

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <span>📋</span> Organisation lease defaults
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standard clauses for all your leases — deposit handling, maintenance, notice
              periods. Toggle optional clauses on/off.{" "}
              <span className="text-muted-foreground/60">Applies to: every lease across your portfolio.</span>
            </p>
          </div>
          <Link
            href="/settings/lease-templates"
            className="shrink-0 text-xs text-brand hover:underline whitespace-nowrap"
          >
            Edit &rarr;
          </Link>
        </div>

        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <span>🏠</span> Unit clause overrides
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Override specific clauses for individual units. Most units use your org defaults —
            only set overrides for exceptions.{" "}
            <span className="text-muted-foreground/60">
              Edit on each unit&rsquo;s detail page (click a unit above).
            </span>
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/40">
        When you create a lease, Pleks combines all three levels into one document automatically.
      </p>
    </div>
  )
}
