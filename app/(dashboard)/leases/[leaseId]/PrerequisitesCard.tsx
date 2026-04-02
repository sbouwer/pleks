import Link from "next/link"
import { Check, X, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface PrerequisiteResult {
  key: string
  label: string
  status: "pass" | "fail" | "warning"
  message: string
  action?: { label: string; href: string }
}

interface PrerequisitesCheck {
  items: PrerequisiteResult[]
  canProceed: boolean
  failCount: number
  warningCount: number
}

interface PrerequisitesCardProps {
  prereqs: PrerequisitesCheck
}

function StatusIcon({ status }: { status: PrerequisiteResult["status"] }) {
  if (status === "pass") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <Check className="size-3" strokeWidth={2.5} />
      </span>
    )
  }
  if (status === "fail") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <X className="size-3" strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <AlertTriangle className="size-3" strokeWidth={2.5} />
    </span>
  )
}

function PrerequisiteRow({ item }: { item: PrerequisiteResult }) {
  const isMuted = item.status === "pass"

  return (
    <div className={`flex items-start gap-3 ${isMuted ? "opacity-50" : ""}`}>
      <StatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${isMuted ? "text-muted-foreground" : ""}`}>
          {item.label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.message}</p>
        {item.action && (
          <Link
            href={item.action.href}
            className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
          >
            {item.action.label} →
          </Link>
        )}
      </div>
    </div>
  )
}

export function PrerequisitesCard({ prereqs }: Readonly<PrerequisitesCardProps>) {
  const failItems = prereqs.items.filter((i) => i.status === "fail")
  const warnItems = prereqs.items.filter((i) => i.status === "warning")
  const passItems = prereqs.items.filter((i) => i.status === "pass")

  const actionableItems = [...failItems, ...warnItems]
  const hasWarnings = warnItems.length > 0
  const hasFails = failItems.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready to send for signing?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Fail items */}
        {failItems.map((item) => (
          <PrerequisiteRow key={item.key} item={item} />
        ))}

        {/* Divider between fails and warnings */}
        {hasFails && hasWarnings && (
          <div className="border-t border-border/40" />
        )}

        {/* Warning items */}
        {warnItems.map((item) => (
          <PrerequisiteRow key={item.key} item={item} />
        ))}

        {/* Divider between actionable and pass items */}
        {actionableItems.length > 0 && passItems.length > 0 && (
          <div className="border-t border-border/40" />
        )}

        {/* Pass items — muted */}
        {passItems.map((item) => (
          <PrerequisiteRow key={item.key} item={item} />
        ))}

        {/* Summary */}
        <div className="border-t border-border/40 pt-3">
          {prereqs.failCount > 0 ? (
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {prereqs.failCount} {prereqs.failCount === 1 ? "item needs" : "items need"} attention
            </p>
          ) : (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              All requirements met
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
