"use client"

// BUILD_44 — Property Rules Editor
// Full implementation: library rules, custom rules, HOA PDF upload.
// This component is a placeholder until BUILD_44 is implemented.

interface Props {
  propertyId: string
  isSectionalTitle: boolean
  tier: string
}

export function PropertyRulesEditor({ propertyId, isSectionalTitle, tier }: Readonly<Props>) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-surface-elevated/50 px-5 py-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">Property rules</p>
      <p className="text-xs text-muted-foreground mt-1">
        Library rules, custom rules
        {isSectionalTitle ? ", and HOA conduct rules" : ""} — coming in BUILD_44.
      </p>
      <p className="text-[10px] text-muted-foreground/50 mt-3 font-mono">
        propertyId={propertyId} · tier={tier}
      </p>
    </div>
  )
}
