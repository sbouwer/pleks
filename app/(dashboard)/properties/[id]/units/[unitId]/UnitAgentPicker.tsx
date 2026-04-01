"use client"

import { useTransition } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assignUnitAgent } from "../../actions"

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

interface UnitAgentPickerProps {
  propertyId: string
  unitId: string
  currentAgentId: string | null
  propertyManagerId: string | null
  teamMembers: TeamMember[]
}

export function UnitAgentPicker({
  unitId,
  currentAgentId,
  propertyManagerId,
  teamMembers,
}: Readonly<UnitAgentPickerProps>) {
  const [isPending, startTransition] = useTransition()

  const pmMember = teamMembers.find((m) => m.userId === propertyManagerId)
  const inheritLabel = pmMember
    ? `Inherit from property manager (${pmMember.name})`
    : "Inherit from property manager"

  function handleChange(value: string | null) {
    const next = value === "__inherit__" || value === null ? null : value
    startTransition(() => {
      assignUnitAgent(unitId, next)
    })
  }

  if (teamMembers.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members to assign.</p>
  }

  return (
    <div className="space-y-2">
      <Select
        value={currentAgentId ?? "__inherit__"}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select agent..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__inherit__">
            <span className="text-muted-foreground">{inheritLabel}</span>
          </SelectItem>
          <SelectSeparator />
          {teamMembers.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              <span>{m.name}</span>
              <span className="text-muted-foreground text-xs ml-1">({ROLE_LABELS[m.role] ?? m.role})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <p className="text-xs text-muted-foreground">Saving...</p>}
    </div>
  )
}
