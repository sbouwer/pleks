/**
 * components/popia/RequestTypePicker.tsx — POPIA right type selection sheet
 *
 * Auth:   N/A — pure presentational; parent handles submission
 * Notes:  D-POPIA-03: 8 request types. Nuke shows carve-out disclosure first (D-POPIA-05).
 *         onSelect fires with the chosen type; parent routes to the request form.
 */
"use client"

import { Shield, FileSearch, FilePen, Trash2, Ban, Pause, Download, MinusCircle, Bomb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { RequestType } from "@/lib/popia/requests"

interface RequestTypeOption {
  type: RequestType
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  destructive?: boolean
}

const OPTIONS: RequestTypeOption[] = [
  {
    type: "access",
    label: "Access",
    description: "Get a copy of what data is held about you.",
    icon: FileSearch,
  },
  {
    type: "correction",
    label: "Correction",
    description: "Report inaccurate or incomplete data.",
    icon: FilePen,
  },
  {
    type: "erasure",
    label: "Erasure",
    description: "Request deletion of specific data (subject to legal retention periods).",
    icon: Trash2,
    destructive: true,
  },
  {
    type: "objection",
    label: "Objection",
    description: "Object to a specific processing purpose.",
    icon: Ban,
  },
  {
    type: "restriction",
    label: "Restriction",
    description: "Pause processing without deletion.",
    icon: Pause,
  },
  {
    type: "portability",
    label: "Portability",
    description: "Receive your data in a machine-readable format.",
    icon: Download,
  },
  {
    type: "consent_withdrawal",
    label: "Withdraw consent",
    description: "Withdraw a specific consent you previously gave.",
    icon: MinusCircle,
  },
  {
    type: "nuke",
    label: "Full erasure",
    description: "Delete everything we are legally allowed to delete. Carve-outs will be disclosed.",
    icon: Bomb,
    destructive: true,
  },
]

interface RequestTypePickerProps {
  onSelect: (type: RequestType) => void
  className?: string
}

export function RequestTypePicker({ onSelect, className }: Readonly<RequestTypePickerProps>) {
  return (
    <div className={cn("grid gap-2", className)}>
      {OPTIONS.map((opt) => {
        const Icon = opt.icon
        return (
          <Button
            key={opt.type}
            variant="outline"
            className={cn(
              "h-auto flex-col items-start gap-1 p-4 text-left",
              opt.destructive && "border-destructive/30 hover:border-destructive/60",
            )}
            onClick={() => onSelect(opt.type)}
          >
            <div className="flex items-center gap-2 w-full">
              <Icon className={cn("size-4 shrink-0", opt.destructive && "text-destructive")} />
              <span className={cn("font-medium", opt.destructive && "text-destructive")}>
                {opt.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-normal">{opt.description}</p>
          </Button>
        )
      })}

      <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
        <Shield className="size-3.5 shrink-0 mt-0.5" />
        <span>
          Your rights under POPIA. The agency has 30 calendar days to respond.
          If you do not hear back, you may complain to the Information Regulator at{" "}
          <span className="font-mono">complaints.IR@justice.gov.za</span>.
        </span>
      </div>
    </div>
  )
}
