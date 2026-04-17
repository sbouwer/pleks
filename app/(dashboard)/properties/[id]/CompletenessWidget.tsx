"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, Mail, Edit3, X, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CompletenessItem, CompletenessTopic } from "@/lib/properties/computeCompleteness"
import { dismissCompletenessWidget } from "@/lib/actions/dismissCompletenessWidget"
import {
  createInfoRequestFromWidget,
  sendInfoRequestReminder,
  type InfoRequestTopic,
} from "@/lib/actions/propertyInfoRequests"

// ── Topic → action mapping ────────────────────────────────────────────────────

const TOPIC_DEEP_LINKS: Partial<Record<CompletenessTopic, (propertyId: string) => string>> = {
  insurance: (id) => `/properties/${id}/insurance`,
  scheme:    (id) => `/properties/${id}/scheme`,
  documents: (id) => `/properties/${id}/documents`,
  units:     (id) => `/properties/${id}/units`,
  owner:     (id) => `/properties/${id}?tab=overview#owner`,
  banking:   (id) => `/properties/${id}?tab=overview#owner`,
  broker:    (id) => `/properties/${id}/insurance`,
}

const TOPIC_REQUEST_FIELDS: Partial<Record<CompletenessTopic, string[]>> = {
  insurance: ["insurance_provider", "insurance_policy_number", "insurance_renewal_date", "insurance_replacement_value_cents"],
  owner:     ["entity_type", "first_name", "last_name", "company_name", "email", "phone"],
  scheme:    ["scheme_name", "managing_agent_name", "managing_agent_email", "managing_agent_phone"],
  banking:   ["bank_name", "bank_account_number", "bank_branch_code"],
  documents: ["title_deed", "compliance_certificates"],
  broker:    ["broker_name", "broker_email", "broker_phone"],
}

function topicCanBeRequested(topic: CompletenessTopic): boolean {
  return topic in TOPIC_REQUEST_FIELDS
}

function toInfoRequestTopic(topic: CompletenessTopic): InfoRequestTopic | null {
  switch (topic) {
    case "owner":     return "landlord"
    case "insurance": return "insurance"
    case "broker":    return "broker"
    case "scheme":    return "scheme"
    case "banking":   return "banking"
    case "documents": return "documents"
    default:          return null   // address / units don't get info_requests
  }
}

// ── Item row ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  propertyId:    string
  item:          CompletenessItem
  ownerEmail?:   string | null
  onActionDone:  () => void
}

function ItemRow({ propertyId, item, ownerEmail, onActionDone }: ItemRowProps) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const deepLinkFn = TOPIC_DEEP_LINKS[item.topic]
  const canRequest = topicCanBeRequested(item.topic)
  const hasOpenRequest = !!item.pendingRequestId

  function sendOwnerEmail() {
    if (!ownerEmail) {
      setFeedback("Add an owner email first")
      return
    }
    const topic = toInfoRequestTopic(item.topic)
    if (!topic) {
      setFeedback("This item can't be requested by email")
      return
    }
    startTransition(async () => {
      const result = await createInfoRequestFromWidget({
        propertyId,
        topic,
        missingFields:  TOPIC_REQUEST_FIELDS[item.topic] ?? [],
        recipientType:  "owner",
        recipientEmail: ownerEmail,
      })
      if (result.ok) {
        setFeedback("Email sent")
        onActionDone()
      } else {
        setFeedback(result.error ?? "Failed to send")
      }
    })
  }

  function sendReminder() {
    if (!item.pendingRequestId) return
    startTransition(async () => {
      const result = await sendInfoRequestReminder(item.pendingRequestId!)
      if (result.ok) {
        setFeedback("Reminder sent")
        onActionDone()
      } else {
        setFeedback(result.error ?? "Failed to send reminder")
      }
    })
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {item.done
          ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
          : <Circle       className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground/40" />}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium", item.done && "text-muted-foreground")}>
            {item.label}
          </p>
          {item.detail && (
            <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
          )}
          {hasOpenRequest && (
            <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
              Owner request pending
            </p>
          )}
          {!item.done && (
            <div className="flex flex-wrap gap-2 mt-2">
              {hasOpenRequest && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={sendReminder}
                  disabled={pending}
                >
                  <Send className="w-3 h-3" />
                  Send reminder
                </Button>
              )}
              {!hasOpenRequest && canRequest && ownerEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={sendOwnerEmail}
                  disabled={pending}
                >
                  <Mail className="w-3 h-3" />
                  Send owner email
                </Button>
              )}
              {deepLinkFn && (
                <a
                  href={deepLinkFn(propertyId)}
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-md border border-input bg-background hover:bg-accent transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                  Add manually
                </a>
              )}
            </div>
          )}
          {feedback && (
            <p className="text-xs text-muted-foreground mt-1.5">{feedback}</p>
          )}
        </div>
      </div>
    </li>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────────

interface CompletenessWidgetProps {
  propertyId:  string
  pct:         number
  outstanding: CompletenessItem[]
  ownerEmail?: string | null
}

export function CompletenessWidget({ propertyId, pct, outstanding, ownerEmail }: CompletenessWidgetProps) {
  const [dismissing, startDismiss] = useTransition()
  const [hidden, setHidden] = useState(false)

  function handleDismiss() {
    startDismiss(async () => {
      const result = await dismissCompletenessWidget(propertyId)
      if (result.ok) setHidden(true)
    })
  }

  if (hidden || outstanding.length === 0) return null

  return (
    <Card className="mb-4 border-primary/30">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Setup progress</h3>
          <span className="text-xs font-medium text-muted-foreground">{pct}% complete</span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {outstanding.length} item{outstanding.length === 1 ? "" : "s"} outstanding
        </p>

        <ul className="divide-y divide-border/50">
          {outstanding.map((item) => (
            <ItemRow
              key={item.topic}
              propertyId={propertyId}
              item={item}
              ownerEmail={ownerEmail}
              onActionDone={() => undefined}
            />
          ))}
        </ul>

        <div className="flex justify-end mt-3 pt-3 border-t border-border/50">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={dismissing}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Dismiss for now
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
