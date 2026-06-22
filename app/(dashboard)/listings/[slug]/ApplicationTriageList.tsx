"use client"

/**
 * app/(dashboard)/listings/[slug]/ApplicationTriageList.tsx — the listing's submitted applications as a
 * canonical triage list-line (level 2).
 *
 * Auth:   parent page is gatewaySSR; the server actions re-check capability + org.
 * Data:   TriageApp[] from the listing page (submitted only). Inline ✓ = shortlistStage1Action (mark, no email),
 *         ✗ = declineStage1Action (with a few-second UNDO before the rejection email actually fires), 👁 = open.
 * Notes:  Built for scale ("200 applications, one unit — keep the greens, pre-decline the reds"). Decisions are
 *         optimistic; the decline only commits (and emails) after the undo window. Bulk = BulkDecidePanel.
 */
import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ListToolbar, ToolbarFilter, ListCard, SortHeader, useListSort } from "@/components/ui/resource-list"
import { IconButton } from "@/components/ui/actions"
import { formatZAR } from "@/lib/constants"
import { shortlistStage1Action, declineStage1Action } from "@/lib/applications/applicationActions"
import { Eye, Check, X, Users } from "lucide-react"

export interface TriageApp {
  id: string
  name: string
  type: string
  coCount: number
  incomeCents: number | null
  stage1Status: string
  stage2Status: string | null
  prescreenScore: number | null
  fitscore: number | null
  ruling: { tier: string; affordabilityPct: number | null; confidenceTier: string } | null
}

type Decision = "shortlisted" | "declined" | "pending"
type TriageSortKey = "match" | "income" | "name"
const UNDO_MS = 5000

const TYPE_LABEL: Record<string, string> = { individual: "Individual", couple: "Couple", company: "Company", guarantor: "Guarantor" }
const RULING_CHIP: Record<string, { label: string; cls: string }> = {
  strong: { label: "Strong", cls: "bg-emerald-600" },
  adequate: { label: "Adequate", cls: "bg-emerald-600" },
  "needs-evidence": { label: "Needs evidence", cls: "bg-amber-500" },
  "below-threshold": { label: "Affordability", cls: "bg-red-600" },
}
const TIER_RANK: Record<string, number> = { strong: 90, adequate: 70, "needs-evidence": 45, "below-threshold": 20 }

/** Server-derived decision before any optimistic override. */
function serverDecision(a: TriageApp): Decision {
  if (a.stage1Status === "shortlisted" || a.stage2Status === "approved") return "shortlisted"
  if (a.stage1Status === "not_shortlisted" || a.stage2Status === "declined" || a.stage2Status === "withdrawn") return "declined"
  return "pending"
}
/** A comparable "match" value for sorting — FitScore, else the ruling tier, else the prescreen score. */
function matchValue(a: TriageApp): number {
  if (a.fitscore != null) return a.fitscore
  if (a.ruling) return TIER_RANK[a.ruling.tier] ?? 0
  return a.prescreenScore ?? -1
}
/** Fallback numeric label when there's no 14M ruling chip to show. */
function scoreLabel(a: TriageApp): string {
  if (a.fitscore != null) return `${a.fitscore}/100`
  if (a.prescreenScore != null) return `${a.prescreenScore}/45`
  return "—"
}

const DECISION_FILTER = [
  { value: "pending", label: "Undecided" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "declined", label: "Declined" },
]

export function ApplicationTriageList({ slug, applications }: Readonly<{ slug: string; applications: TriageApp[] }>) {
  const router = useRouter()
  const [overrides, setOverrides] = useState<Map<string, Decision>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [search, setSearch] = useState("")
  const [decisions, setDecisions] = useState<string[]>([])
  const { sortKey, sortDir, onSort } = useListSort<TriageSortKey>("match", "desc")

  const decisionOf = (a: TriageApp): Decision => overrides.get(a.id) ?? serverDecision(a)

  function setDecision(id: string, d: Decision | null) {
    setOverrides((prev) => {
      const next = new Map(prev)
      if (d) next.set(id, d); else next.delete(id)
      return next
    })
  }

  async function shortlist(a: TriageApp) {
    const prev = overrides.get(a.id) ?? null
    setDecision(a.id, "shortlisted")
    const r = await shortlistStage1Action(a.id)
    if (r?.error) { toast.error(r.error); setDecision(a.id, prev) }
    else toast.success(`${a.name} shortlisted`)
  }

  function decline(a: TriageApp) {
    const prev = overrides.get(a.id) ?? null
    setDecision(a.id, "declined")  // optimistic — row greys out immediately
    const t = setTimeout(async () => {
      timers.current.delete(a.id)
      const r = await declineStage1Action(a.id)   // commits + sends the neutral rejection email
      if (r?.error) { toast.error(r.error); setDecision(a.id, prev) }
    }, UNDO_MS)
    timers.current.set(a.id, t)
    toast("Application declined", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const timer = timers.current.get(a.id)
          if (timer) clearTimeout(timer)
          timers.current.delete(a.id)
          setDecision(a.id, prev)   // nothing was written/emailed — just revert the optimistic state
        },
      },
    })
  }

  const q = search.trim().toLowerCase()
  const rows = useMemo(() => {
    const filtered = applications.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false
      if (decisions.length > 0 && !decisions.includes(overrides.get(a.id) ?? serverDecision(a))) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === "match") cmp = matchValue(a) - matchValue(b)
      else if (sortKey === "income") cmp = (a.incomeCents ?? 0) - (b.incomeCents ?? 0)
      else cmp = a.name.localeCompare(b.name)
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [applications, q, decisions, overrides, sortKey, sortDir])

  if (applications.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No submitted applications yet. Share the public link above to start receiving applications.</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search applicants by name…"
        filters={<ToolbarFilter label="Decision" multiple selected={decisions} onChange={setDecisions} options={DECISION_FILTER} />}
      />
      <p className="text-xs text-muted-foreground">{rows.length} of {applications.length} applications</p>

      <ListCard fill>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[12%]" /><col className="w-[26%]" /><col className="w-[22%]" />
            <col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[12%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-border/60 bg-card">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left"><SortHeader col="name" label="Applicant" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
              <th className="px-3 py-2.5 text-left"><SortHeader col="match" label="Match" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
              <th className="px-3 py-2.5 text-left"><SortHeader col="income" label="Income" sortKey={sortKey} sortDir={sortDir} onSort={onSort} /></th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Decision</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((a) => {
              const d = decisionOf(a)
              const chip = a.ruling ? RULING_CHIP[a.ruling.tier] : null
              return (
                <tr key={a.id} className={d === "declined" ? "opacity-45" : ""}>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{TYPE_LABEL[a.type] ?? a.type}</td>
                  <td className="truncate px-3 py-3">
                    <span className="font-medium">{a.name}</span>
                    {a.coCount > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Users className="size-3" />+{a.coCount}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {chip
                      ? <span className="inline-flex items-center gap-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${chip.cls}`}>{chip.label}</span>{a.ruling?.affordabilityPct != null && <span className="text-xs text-muted-foreground">{a.ruling.affordabilityPct}%</span>}</span>
                      : <span className="text-sm text-muted-foreground">{scoreLabel(a)}</span>}
                  </td>
                  <td className="px-3 py-3">{a.incomeCents ? `${formatZAR(a.incomeCents)}/mo` : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-3 text-xs">
                    {d === "shortlisted" && <span className="font-medium text-emerald-600">Shortlisted</span>}
                    {d === "declined" && <span className="font-medium text-red-600">Declined</span>}
                    {d === "pending" && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={<Eye className="size-4" />} label="View application" onClick={() => router.push(`/listings/${slug}/applications/${a.id}`)} />
                      {d !== "shortlisted" && <IconButton icon={<Check className="size-4 text-emerald-600" />} label="Pre-approve (shortlist)" onClick={() => shortlist(a)} />}
                      {d !== "declined" && <IconButton icon={<X className="size-4 text-red-600" />} label="Decline" onClick={() => decline(a)} />}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ListCard>
    </div>
  )
}
