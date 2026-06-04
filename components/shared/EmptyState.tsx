"use client"

/**
 * components/shared/EmptyState.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { ActionButton } from "@/components/ui/actions"

interface EmptyStateProps {
  readonly icon: React.ReactNode
  readonly title: string
  readonly description: string
  readonly action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-xl bg-surface-elevated p-4 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-md mb-6">{description}</p>
      {action && (
        <ActionButton tone="primary" onClick={action.onClick}>{action.label}</ActionButton>
      )}
    </div>
  )
}
