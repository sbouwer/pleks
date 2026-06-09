"use client"

/**
 * app/(dashboard)/properties/[id]/AgentPicker.tsx — set a property's manager (agent or team) (ADDENDUM_TEAMS)
 *
 * Route:  /properties/[id] (overview)
 * Auth:   rendered under the property detail's gatewaySSR; setPropertyManager is an audited write action
 * Data:   setPropertyManager (managing_agent_id XOR managing_team_id); listTeamOptions; on handover,
 *         getPropertyHandoverCount + movePropertyItems
 * Notes:  "Managed by" = an agent, a team (firm), or Everyone/Org (both null — D-11/12). setPropertyManager
 *         sets both columns (one null) so switching agent↔team respects the not-both CHECK. Changing the
 *         manager offers to move the outgoing manager's open items on this property (§1d).
 */
import { useEffect, useState, useTransition, startTransition } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ActionButton, Modal } from "@/components/ui/actions"
import { useTier } from "@/hooks/useTier"
import { setPropertyManager } from "@/lib/work/assignees"
import { getPropertyHandoverCount, movePropertyItems } from "@/lib/work/reassign"
import { listTeamOptions } from "@/lib/work/teams"

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  property_manager: "Property Manager",
  agent: "Agent",
  accountant: "Accountant",
  maintenance_manager: "Maintenance Manager",
}

interface TeamMember {
  userId: string
  name: string
  role: string
}

interface AgentPickerProps {
  propertyId: string
  currentAgentId: string | null
  currentTeamId?: string | null
  teamMembers: TeamMember[]
}

interface Handover { count: number; fromId: string; toId: string | null; toName: string }

export function AgentPicker({ propertyId, currentAgentId, currentTeamId = null, teamMembers }: Readonly<AgentPickerProps>) {
  const { tier } = useTier()
  const router = useRouter()
  const [isPending, startPending] = useTransition()
  const [handover, setHandover] = useState<Handover | null>(null)
  const [movingItems, setMovingItems] = useState(false)
  const { data: teams = [] } = useQuery({ queryKey: ["team-options"], queryFn: listTeamOptions, staleTime: 5 * 60 * 1000 })

  // Auto-assign sole member on owner tier when no manager set
  useEffect(() => {
    if (tier === "owner" && !currentAgentId && !currentTeamId && teamMembers.length === 1) {
      startTransition(() => {
        setPropertyManager(propertyId, teamMembers[0].userId, null)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, currentAgentId, currentTeamId, teamMembers.length])

  const currentMember = teamMembers.find((m) => m.userId === currentAgentId)
  const currentTeam = teams.find((t) => t.id === currentTeamId)
  const currentValue = currentTeamId ? `team:${currentTeamId}` : (currentAgentId ?? "__none__")

  function handleChange(value: string | null) {
    const v = value ?? "__none__"
    const teamId = v.startsWith("team:") ? v.slice(5) : null
    const agentId = (v === "__none__" || teamId) ? null : v
    const oldManager = currentAgentId  // handover only meaningful when the outgoing manager was an agent
    startPending(async () => {
      const res = await setPropertyManager(propertyId, agentId, teamId)
      if ("error" in res) { toast.error(res.error); router.refresh(); return }
      if (oldManager && oldManager !== agentId) {
        const count = await getPropertyHandoverCount(propertyId, oldManager)
        if (count > 0) {
          let toName = "Everyone (org)"
          if (teamId) toName = teams.find((t) => t.id === teamId)?.name ?? "the new team"
          else if (agentId) toName = teamMembers.find((m) => m.userId === agentId)?.name ?? "the new manager"
          setHandover({ count, fromId: oldManager, toId: agentId, toName })
        }
      }
      router.refresh()
    })
  }

  async function confirmHandover() {
    if (!handover) return
    setMovingItems(true)
    const res = await movePropertyItems(propertyId, handover.fromId, handover.toId)
    setMovingItems(false)
    if ("error" in res) { toast.error(res.error || "Could not move items") }
    else { toast.success(`Moved ${res.moved} item${res.moved === 1 ? "" : "s"}`); router.refresh() }
    setHandover(null)
  }

  if (teamMembers.length === 0) return null

  let moveLabel = "Move"
  if (handover) moveLabel = `Move ${handover.count} item${handover.count === 1 ? "" : "s"}`

  let triggerNode = <span className="text-muted-foreground italic">Assign property manager</span>
  if (currentTeam) triggerNode = <span className="font-medium text-foreground">{currentTeam.name} <span className="text-xs text-muted-foreground">(team)</span></span>
  else if (currentMember) triggerNode = <span className="font-medium text-foreground">{currentMember.name}</span>

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-sm text-muted-foreground">Managed by:</span>
      <Select value={currentValue} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger size="sm" className="h-7 text-sm border-0 bg-transparent px-1 hover:bg-surface focus-visible:ring-0 w-auto gap-1">
          <SelectValue>{triggerNode}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {teamMembers.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              <span>{m.name}</span>
              <span className="text-muted-foreground text-xs ml-1">({ROLE_LABELS[m.role] ?? m.role})</span>
            </SelectItem>
          ))}
          {teams.length > 0 && (
            <>
              <SelectSeparator />
              {teams.map((t) => (
                <SelectItem key={t.id} value={`team:${t.id}`}>
                  <span>{t.name}</span>
                  <span className="text-muted-foreground text-xs ml-1">(team)</span>
                </SelectItem>
              ))}
            </>
          )}
          {(currentAgentId || currentTeamId) && (
            <>
              <SelectSeparator />
              <SelectItem value="__none__">
                <span>Everyone (org)</span>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      {isPending && <span className="text-xs text-muted-foreground">Saving...</span>}

      {handover && (
        <Modal
          open
          onClose={() => setHandover(null)}
          title="Move open items?"
          actions={
            <>
              <ActionButton onClick={() => setHandover(null)}>Keep with previous</ActionButton>
              <ActionButton tone="primary" onClick={confirmHandover} disabled={movingItems}>
                {movingItems ? "Moving…" : moveLabel}
              </ActionButton>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            This property has {handover.count} open work item{handover.count === 1 ? "" : "s"} still assigned to the
            previous manager. Move {handover.count === 1 ? "it" : "them"} to {handover.toName}?
          </p>
        </Modal>
      )}
    </div>
  )
}
