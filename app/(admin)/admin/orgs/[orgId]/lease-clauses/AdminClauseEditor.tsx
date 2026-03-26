"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface ClauseRow {
  clause_key: string
  title: string
  body_template: string
  is_required: boolean
  sort_order: number
  lease_type: string
  custom_body: string | null
}

interface AdminClauseEditorProps {
  orgId: string
  clauses: ClauseRow[]
}

export function AdminClauseEditor({ orgId, clauses }: Readonly<AdminClauseEditorProps>) {
  const router = useRouter()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)

  function startEdit(clause: ClauseRow) {
    setEditingKey(clause.clause_key)
    setEditValue(clause.custom_body ?? clause.body_template)
  }

  async function handleSave(clauseKey: string) {
    setSaving(true)
    const res = await fetch("/api/admin/org-clause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, clauseKey, customBody: editValue }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Custom wording saved")
      setEditingKey(null)
      router.refresh()
    } else {
      toast.error("Failed to save")
    }
  }

  async function handleReset(clauseKey: string) {
    setSaving(true)
    const res = await fetch("/api/admin/org-clause", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, clauseKey }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Reset to standard")
      setEditingKey(null)
      router.refresh()
    } else {
      toast.error("Failed to reset")
    }
  }

  return (
    <div className="space-y-2">
      {clauses.map((clause) => {
        const isEditing = editingKey === clause.clause_key
        const hasCustom = !!clause.custom_body
        return (
          <Card key={clause.clause_key}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{clause.title}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {clause.lease_type}
                  </Badge>
                  {hasCustom && (
                    <Badge variant="secondary" className="text-brand border-brand/30 text-[10px] px-1.5 py-0">
                      Custom
                    </Badge>
                  )}
                  {clause.is_required && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </div>
                {!isEditing && (
                  <Button variant="outline" size="sm" onClick={() => startEdit(clause)}>
                    Edit
                  </Button>
                )}
              </div>

              {isEditing && (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full min-h-[200px] rounded-md border border-border/50 bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                  <p className="text-xs text-muted-foreground">
                    Available tokens: {`{{var:lessor_name}}`}, {`{{ref:rental_deposit}}`}, {`{{self:5}}`} etc.
                    Do not remove tokens that exist in the standard wording.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => handleSave(clause.clause_key)} disabled={saving}>
                      {saving ? "Saving..." : "Save custom wording"}
                    </Button>
                    {hasCustom && (
                      <Button size="sm" variant="outline" onClick={() => handleReset(clause.clause_key)} disabled={saving}>
                        Reset to standard
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
