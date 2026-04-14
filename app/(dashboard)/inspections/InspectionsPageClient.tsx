"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ClipboardCheck, Plus, Download, CheckCircle2, Loader2 } from "lucide-react"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchInspectionsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { downloadForOffline, getSavedIds } from "@/lib/offline/inspectionDownload"
import { toast } from "sonner"

const STATUS_MAP: Record<string, "scheduled" | "pending" | "active" | "completed" | "arrears"> = {
  scheduled: "scheduled",
  in_progress: "pending",
  completed: "completed",
  awaiting_tenant_review: "pending",
  disputed: "arrears",
  dispute_resolved: "completed",
  finalised: "completed",
}

/** Inspections whose status makes sense to save for offline field use */
function isSaveable(status: string): boolean {
  return status === "scheduled" || status === "in_progress"
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

interface Props { orgId: string }

export function InspectionsPageClient({ orgId }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.inspections(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchInspectionsAction(orgId),
    staleTime: STALE_TIME.inspections,
  })

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // Load saved IDs from IndexedDB on mount
  useEffect(() => {
    getSavedIds().then((ids) => setSavedIds(new Set(ids))).catch(() => {})
  }, [])

  const handleSave = useCallback(async (inspectionId: string) => {
    setSavingId(inspectionId)
    try {
      await downloadForOffline(inspectionId)
      setSavedIds((prev) => new Set([...prev, inspectionId]))
      toast.success("Saved for offline")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSavingId(null)
    }
  }, [])

  const todayIds = list
    .filter((i) => isSaveable(i.status) && isToday(i.scheduled_date as string | null))
    .map((i) => i.id)
    .filter((id) => !savedIds.has(id))

  const handleSaveAll = useCallback(async () => {
    if (todayIds.length === 0) return
    setSavingAll(true)
    try {
      await Promise.all(todayIds.map((id) => downloadForOffline(id)))
      setSavedIds((prev) => new Set([...prev, ...todayIds]))
      toast.success(`${todayIds.length} inspection${todayIds.length === 1 ? "" : "s"} saved for offline`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSavingAll(false)
    }
  }, [todayIds])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Inspections</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{list.length} inspections</p>
          )}
          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Updated {relativeTime(new Date(dataUpdatedAt))}</span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey })}
                className="text-brand hover:underline"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save all today's inspections (Mode B batch) — mobile only */}
          {todayIds.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveAll}
              disabled={savingAll}
              className="lg:hidden"
            >
              {savingAll
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <Download className="h-3.5 w-3.5 mr-1" />}
              Save today&apos;s ({todayIds.length})
            </Button>
          )}
          <Button render={<Link href="/inspections/new" />}>
            <Plus className="h-4 w-4 mr-1" /> Schedule Inspection
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8 text-muted-foreground" />}
          title="No inspections yet"
          description="Schedule your first inspection from a unit's detail page."
        />
      ) : (
        <div className="space-y-2">
          {list.map((insp) => {
            const unit = insp.units as unknown as { unit_number: string; properties: { name: string } } | null
            const tenant = insp.tenant_view as unknown as { first_name: string; last_name: string } | null
            const isSaved = savedIds.has(insp.id)
            const isSaving = savingId === insp.id
            const canSave = isSaveable(insp.status)

            return (
              <div key={insp.id} className="relative">
                <Link href={`/inspections/${insp.id}`}>
                  <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                    <CardContent className="flex items-center justify-between pt-4 pb-4">
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-medium capitalize">
                          {insp.inspection_type.replaceAll("_", " ")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                          {tenant ? ` · ${tenant.first_name} ${tenant.last_name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            if (insp.scheduled_date) return `Scheduled: ${new Date(insp.scheduled_date as string).toLocaleDateString("en-ZA")}`
                            if (insp.conducted_date) return `Conducted: ${new Date(insp.conducted_date as string).toLocaleDateString("en-ZA")}`
                            return ""
                          })()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs capitalize text-muted-foreground">{insp.lease_type}</span>
                        <StatusBadge status={STATUS_MAP[insp.status] || "scheduled"} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                {/* Save for offline button — mobile only, saveable inspections */}
                {canSave && (
                  <button
                    onClick={(e) => { e.preventDefault(); void handleSave(insp.id) }}
                    disabled={isSaved || isSaving}
                    className="lg:hidden absolute top-3 right-[7.5rem] flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 disabled:opacity-60 transition-colors z-10"
                    aria-label={isSaved ? "Saved for offline" : "Save for offline"}
                  >
                    {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isSaved && !isSaving && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                    {!isSaving && !isSaved && <Download className="h-3 w-3" />}
                    <span>{isSaved ? "Saved" : "Save"}</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
