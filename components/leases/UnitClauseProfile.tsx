"use client"

/**
 * components/leases/UnitClauseProfile.tsx — Unit-level optional clause override card shown on unit detail pages
 *
 * Auth:   gateway (dashboard layout)
 * Data:   /api/leases/unit-clause-profile (GET + PATCH); /api/user/preferences for hint dismiss
 */
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ActionButton, EditButton, InlineLink } from "@/components/ui/actions"
import { X, Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type TriState = "on" | "off" | "inherit"

function optionClass(option: TriState, active: boolean): string {
  if (!active) return "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
  if (option === "off") return "bg-danger/15 text-danger font-medium"
  if (option === "on") return "bg-brand text-brand-dim font-medium"
  return "bg-surface-elevated text-foreground font-medium"
}

function inheritLabel(orgEnabled: boolean): string {
  return `Inherit (${orgEnabled ? "on" : "off"})`
}

interface ClauseProfileEntry {
  clause_key: string
  title: string
  toggle_label: string | null
  enabled: boolean
  source: "unit_override" | "org_default" | "library_default"
  auto_set: boolean | null
  unit_enabled: boolean | null
  org_enabled: boolean
}

interface UnitClauseProfileProps {
  unitId: string
  propertyId: string
  features?: string[]
  leaseType?: string
}

export function UnitClauseProfile({
  unitId,
  propertyId,
  features = [],
  leaseType = "residential",
}: Readonly<UnitClauseProfileProps>) {
  const [clauses, setClauses] = useState<ClauseProfileEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, TriState>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { preferences: Record<string, unknown> } | null) => {
        if (d && !d.preferences.dismissed_clause_override_hint) setShowHint(true)
      })
      .catch(() => { /* non-critical */ })
  }, [])

  async function dismissHint() {
    setShowHint(false)
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "dismissed_clause_override_hint", value: true }),
    })
  }

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leases/unit-clause-profile?unitId=${unitId}&leaseType=${leaseType}`)
    if (res.ok) {
      const data = await res.json()
      setClauses(data.clauses ?? [])
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [unitId, leaseType])

  function startEdit() {
    const initial: Record<string, TriState> = {}
    for (const c of clauses) {
      let state: TriState = "inherit"
      if (c.source === "unit_override") {
        state = c.unit_enabled ? "on" : "off"
      }
      initial[c.clause_key] = state
    }
    setDraft(initial)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft({})
  }

  function handleDraftChange(key: string, value: TriState) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const updates = Object.entries(draft).map(([clause_key, state]) => ({ clause_key, state }))
    const res = await fetch("/api/leases/unit-clause-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId, updates }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Lease setup saved")
      setEditing(false)
      setDraft({})
      await load()
    } else {
      toast.error("Failed to save lease setup")
    }
  }

  const unitOverrides = clauses.filter((c) => c.source === "unit_override")
  const autoCount = unitOverrides.filter((c) => c.auto_set && c.unit_enabled).length
  const manualCount = unitOverrides.filter((c) => !c.auto_set).length
  const hasFeatures = features.length > 0
  const isEmpty = !hasFeatures && unitOverrides.length === 0

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Lease setup</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading...</p></CardContent>
      </Card>
    )
  }

  function clauseLabel(clause: ClauseProfileEntry) {
    return clause.toggle_label ?? clause.title
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Lease setup</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Controls which optional clauses are included when creating a lease for this unit.
              Based on unit features — review and adjust if needed.
            </p>
            {showHint && (
              <div className="flex items-start justify-between gap-2 mt-2 text-xs text-muted-foreground bg-surface-elevated rounded-md px-3 py-2">
                <span>
                  Overrides here apply to this unit only. Property rules are set on the{" "}
                  <InlineLink href={`/properties/${propertyId}/edit`} withArrow={false}>property edit page</InlineLink>.{" "}
                  Organisation defaults are in{" "}
                  <InlineLink href="/settings/lease-templates">Settings → Lease template</InlineLink>.
                </span>
                <button onClick={dismissHint} className="shrink-0 hover:text-foreground transition-colors" aria-label="Dismiss">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            {!isEmpty && !editing && (
              <p className="text-xs text-muted-foreground mt-1">
                {clauses.filter((c) => c.enabled).length} of {clauses.length} optional clauses active
                {autoCount > 0 && ` · ${autoCount} auto-mapped`}
                {manualCount > 0 && ` · ${manualCount} manual`}
              </p>
            )}
          </div>
          {!editing && !isEmpty && (
            <EditButton mode="label" label="Edit" onClick={startEdit} />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Empty state */}
        {isEmpty && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No unit features have been set yet. Add features like garden, pool, or air-conditioning
              on this unit to automatically configure the right lease clauses.
            </p>
            <InlineLink href={`/properties/${propertyId}/units/${unitId}/edit`}>
              Edit unit features
            </InlineLink>
          </div>
        )}

        {/* Auto-mapped banner */}
        {!isEmpty && !editing && autoCount > 0 && (
          <div className="rounded-lg bg-info-bg text-info text-sm p-3">
            Based on this unit&apos;s features ({features.length} set), we&apos;ve pre-selected {autoCount} optional lease clause{autoCount === 1 ? "" : "s"}.
            Review below and adjust if anything doesn&apos;t apply.
          </div>
        )}

        {/* Edit mode */}
        {editing && (
          <>
            <p className="text-sm text-muted-foreground">
              Toggle clauses on or off for this unit. Changes apply to all future leases —
              existing leases are not affected. Set to &quot;Inherit&quot; to follow your organisation&apos;s default.
            </p>
            <div className="space-y-2">
              {clauses.map((clause) => {
                const state = draft[clause.clause_key] ?? "inherit"
                return (
                  <div key={clause.clause_key} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm",
                          state === "off" && "line-through text-muted-foreground"
                        )}>
                          {clauseLabel(clause)}
                        </span>
                        {clause.auto_set && state !== "inherit" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Auto</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{clause.title}</p>
                    </div>
                    <div className="flex shrink-0 rounded-md border border-border overflow-hidden text-xs mt-0.5">
                      {(["inherit", "on", "off"] as TriState[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleDraftChange(clause.clause_key, option)}
                          className={cn(
                            "px-2.5 py-1 transition-colors capitalize whitespace-nowrap",
                            optionClass(option, state === option),
                            option !== "off" && "border-r border-border"
                          )}
                        >
                          {option === "inherit" ? inheritLabel(clause.org_enabled) : option}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <ActionButton tone="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </ActionButton>
              <ActionButton tone="secondary" icon={<X className="h-3.5 w-3.5" />} onClick={cancelEdit} disabled={saving}>
                Cancel
              </ActionButton>
            </div>
          </>
        )}

        {/* Read mode — overrides list */}
        {!editing && !isEmpty && (
          <>
            {unitOverrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All optional clauses inherit from the org master template.
              </p>
            ) : (
              <div className="space-y-1.5">
                {unitOverrides.map((clause) => (
                  <div
                    key={clause.clause_key}
                    className={cn(
                      "flex items-center justify-between rounded px-2 py-2 text-sm",
                      clause.unit_enabled
                        ? "border-l-2 border-l-brand bg-brand/5"
                        : "border-l-2 border-l-muted"
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn(!clause.unit_enabled && "line-through text-muted-foreground")}>
                        {clauseLabel(clause)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{clause.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      {clause.auto_set && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Auto</Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          clause.unit_enabled
                            ? "bg-brand/15 text-brand border-brand/20"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {clause.unit_enabled ? "On" : "Off"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {clauses.some((c) => c.source !== "unit_override") && unitOverrides.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {clauses.filter((c) => c.source !== "unit_override").length} clauses inherit from org template.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
