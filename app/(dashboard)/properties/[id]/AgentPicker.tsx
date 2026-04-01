"use client"

import { useEffect, useTransition, startTransition } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTier } from "@/hooks/useTier"
import { assignManagingAgent } from "./actions"

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

export function AgentPicker({ propertyId, currentAgentId, teamMembers }: Readonly<AgentPickerProps>) {
  const { tier } = useTier()
  const [isPending, startPending] = useTransition()

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
    startPending(() => {
      assignManagingAgent(propertyId, next)
    })
  }

  if (teamMembers.length === 0) return null

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
                <span className="text-danger">Remove</span>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      {isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
    </div>
  )
}
