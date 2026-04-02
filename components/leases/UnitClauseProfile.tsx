"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pencil, X, Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ClauseProfileEntry {
  clause_key: string
  title: string
  enabled: boolean
  source: "unit_override" | "org_default" | "library_default"
  auto_set: boolean | null
  unit_enabled: boolean | null
  org_enabled: boolean
}

type TriState = "inherit" | "on" | "off"

interface UnitClauseProfileProps {
  unitId: string
  leaseType?: string
}

export function UnitClauseProfile({ unitId, leaseType = "residential" }: UnitClauseProfileProps) {
  const [clauses, setClauses] = useState<ClauseProfileEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, TriState>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leases/unit-clause-profile?unitId=${unitId}&leaseType=${leaseType}`)
    if (res.ok) {
      const data = await res.json()
      setClauses(data.clauses ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [unitId, leaseType]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    const initial: Record<string, TriState> = {}
    for (const c of clauses) {
      if (c.source === "unit_override") {
        initial[c.clause_key] = c.unit_enabled ? "on" : "off"
      } else {
        initial[c.clause_key] = "inherit"
      }
    }
    setDraft(initial)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft({})
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
      toast.success("Clause profile saved")
      setEditing(false)
      setDraft({})
      await load()
    } else {
      toast.error("Failed to save clause profile")
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Clause Profile</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading...</p></CardContent>
      </Card>
    )
  }

  const unitOverrides = clauses.filter((c) => c.source === "unit_override")
  const autoCount = unitOverrides.filter((c) => c.auto_set && c.unit_enabled).length
  const manualCount = unitOverrides.filter((c) => !c.auto_set).length
  const activeCount = clauses.filter((c) => c.enabled).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Clause Profile</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeCount} of {clauses.length} optional clauses active
              {autoCount > 0 && ` · ${autoCount} auto-mapped`}
              {manualCount > 0 && ` · ${manualCount} manual`}
            </p>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {clauses.length === 0 && (
          <p className="text-sm text-muted-foreground">No optional clauses in library.</p>
        )}

        {editing ? (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              <strong>Inherit</strong> uses the org master template default.
              <strong> On/Off</strong> overrides for this unit only.
            </p>
            <div className="space-y-2">
              {clauses.map((clause) => {
                const state = draft[clause.clause_key] ?? "inherit"
                return (
                  <div key={clause.clause_key} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "text-sm truncate",
                        state === "off" && "line-through text-muted-foreground"
                      )}>
                        {clause.title}
                      </span>
                      {clause.auto_set && state !== "inherit" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Auto</Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 rounded-md border border-border overflow-hidden text-xs">
                      {(["inherit", "on", "off"] as TriState[]).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, [clause.clause_key]: option }))}
                          className={cn(
                            "px-2.5 py-1 transition-colors capitalize",
                            state === option
                              ? option === "off"
                                ? "bg-danger/15 text-danger font-medium"
                                : option === "on"
                                  ? "bg-brand text-brand-dim font-medium"
                                  : "bg-surface-elevated text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                            option !== "off" && "border-r border-border"
                          )}
                        >
                          {option === "inherit" ? `Inherit (${clause.org_enabled ? "on" : "off"})` : option}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 pt-3 border-t border-border/40 mt-3">
              <Button size="sm" onClick={save} disabled={saving}>
                <Check className="h-3.5 w-3.5 mr-1" />
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </>
        ) : (
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
                      "flex items-center justify-between rounded px-2 py-1.5 text-sm",
                      clause.unit_enabled
                        ? "border-l-2 border-l-brand bg-brand/5"
                        : "border-l-2 border-l-muted"
                    )}
                  >
                    <span className={cn(!clause.unit_enabled && "line-through text-muted-foreground")}>
                      {clause.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
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
            {clauses.filter((c) => c.source !== "unit_override").length > 0 && unitOverrides.length > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {clauses.filter((c) => c.source !== "unit_override").length} clauses inherit from org template.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
