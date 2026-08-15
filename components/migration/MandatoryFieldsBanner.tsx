/**
 * components/migration/MandatoryFieldsBanner.tsx — the first-touch completion prompt (ADDENDUM_21E §3)
 *
 * Data:   the record's `incomplete_mandatory` set (§5), passed by the detail page that loads it
 * Notes:  Reads are NEVER blocked (§2, "Your Data, Always") — this is a NUDGE, not a lock. The server-side gate
 *         (§1) is what actually refuses an edit/activation that leaves a mandatory field blank; this banner tells
 *         the agent WHAT is missing and WHY it matters, at the moment they open the record (the opportunistic
 *         half of the burn-down). Renders nothing for a complete record.
 */
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { describeMissingFields } from "@/lib/migration/mandatoryFields"

export function MandatoryFieldsBanner({
  entity, missing, editHref,
}: Readonly<{
  entity: "property" | "tenant" | "landlord" | "lease"
  missing: string[] | null | undefined
  editHref: string
}>) {
  if (!missing || missing.length === 0) return null
  const one = missing.length === 1
  return (
    <div className="flex items-start gap-3 rounded-[var(--r-button)] border border-amber-500/40 bg-amber-50 px-4 py-3 mb-4 dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Imported without {describeMissingFields(missing)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This {entity} was migrated with {one ? "a missing detail" : "missing details"}. Add {one ? "it" : "them"} before
          you can serve a notice, generate a statement{entity === "lease" ? ", or activate the lease" : ""}.
        </p>
      </div>
      <Link href={editHref} className="shrink-0 self-center text-sm font-medium text-amber-700 hover:underline">
        Complete
      </Link>
    </div>
  )
}
