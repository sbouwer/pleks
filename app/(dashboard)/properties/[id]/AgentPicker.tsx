"use client"

/**
 * app/(dashboard)/properties/[id]/AgentPicker.tsx — set a property's managing agent (ADDENDUM_TEAMS)
 *
 * Route:  /properties/[id] (overview)
 * Auth:   rendered under the property detail's gatewaySSR; mutations are audited server actions
 * Data:   assignManagingAgent (managing_agent_id); on handover, getPropertyHandoverCount + movePropertyItems
 * Notes:  "Everyone (org)" = null manager (D-11/12). Changing the manager offers to also move the property's
 *         open work items off the outgoing manager (property-handover, ADDENDUM_TEAMS §1d).
 */
import { useEffect, useState, useTransition, startTransition } from "react"
import { useRouter } from "next/navigation"
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
import { assignManagingAgent } from "./actions"
import { getPropertyHandoverCount, movePropertyItems } from "@/lib/work/reassign"

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
  teamMembers: TeamMember[]
}

interface Handover { count: number; fromId: string; toId: string | null; toName: string }

export function AgentPicker({ propertyId, currentAgentId, teamMembers }: Readonly<AgentPickerProps>) {
  const { tier } = useTier()
  const router = useRouter()
  const [isPending, startPending] = useTransition()
  const [handover, setHandover] = useState<Handover | null>(null)
  const [movingItems, setMovingItems] = useState(false)

  // Auto-assign sole member on owner tier when no PM set
  useEffect(() => {
    if (tier === "owner" && !currentAgentId && teamMembers.length === 1) {
      startTransition(() => {
        assignManagingAgent(propertyId, teamMembers[0].userId)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, currentAgentId, teamMembers.length])

  const currentMember = teamMembers.find((m) => m.userId === currentAgentId)

  function handleChange(value: string | null) {
    const next = value === "__none__" || value === null ? null : value
    const oldManager = currentAgentId
    startPending(async () => {
      await assignManagingAgent(propertyId, next)
      // Property handover: offer to move the outgoing manager's open items on this property (§1d).
      if (oldManager && oldManager !== next) {
        const count = await getPropertyHandoverCount(propertyId, oldManager)
        if (count > 0) {
          let toName = "Everyone (org)"
          if (next) toName = teamMembers.find((m) => m.userId === next)?.name ?? "the new manager"
          setHandover({ count, fromId: oldManager, toId: next, toName })
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

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-sm text-muted-foreground">Managed by:</span>
      <Select value={currentAgentId ?? "__none__"} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger size="sm" className="h-7 text-sm border-0 bg-transparent px-1 hover:bg-surface focus-visible:ring-0 w-auto gap-1">
          <SelectValue>
            {currentMember ? (
              <span className="font-medium text-foreground">{currentMember.name}</span>
            ) : (
              <span className="text-muted-foreground italic">Assign property manager</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          {teamMembers.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              <span>{m.name}</span>
              <span className="text-muted-foreground text-xs ml-1">({ROLE_LABELS[m.role] ?? m.role})</span>
            </SelectItem>
          ))}
          {currentAgentId && (
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
