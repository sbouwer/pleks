"use client"

/**
 * app/(dashboard)/applications/[id]/DeclineDecisionModal.tsx — stage-2 decline reason capture (F3 round-4)
 *
 * Route:  /applications/[id]
 * Auth:   parent (ApplicationActions) is gateway-gated
 * Data:   submits a structured decision to declineStage2Action (codes from decisionReasons.ts)
 * Notes:  Standard decline = one click on a plain-language reason (zero typing). The 100-char explanation
 *         is demanded ONLY for "Agent discretion (other)". Contributing adverse factors are optional.
 *         Criminal-record codes are not offered — criminal screening is out of Pleks scope (INDEX 14E).
 */
import { useState } from "react"
import { Modal } from "@/components/ui/actions/Modal"
import { ActionButton } from "@/components/ui/actions"
import { SelectField, TextareaField } from "@/components/forms/fields"
import {
  DECLINE_REASON_CODES,
  ADVERSE_FACTOR_CODES,
  DECLINE_AGENT_DISCRETION_CODE,
  DECLINE_CRIMINAL_RECORD_CODE,
  type DeclineReasonCode,
  type AdverseFactorCode,
} from "@/lib/screening/decisionReasons"
import { DECLINE_REASON_LABELS, ADVERSE_FACTOR_LABELS } from "@/lib/screening/decisionReasonLabels"
import { DISCRETION_MIN_TEXT_LENGTH } from "@/lib/screening/recordDecision"

const REASON_OPTIONS = [
  { value: "", label: "Select a reason…" },
  ...DECLINE_REASON_CODES
    .filter((c) => c !== DECLINE_CRIMINAL_RECORD_CODE)
    .map((c) => ({ value: c, label: DECLINE_REASON_LABELS[c] })),
]

const ADVERSE_OPTIONS = ADVERSE_FACTOR_CODES.filter((c) => c !== "adverse_criminal_record_relevant")

export interface DeclineSubmission {
  declineReasonCode: DeclineReasonCode
  adverseFactorCodes: AdverseFactorCode[]
  declineReasonText: string | null
}

export function DeclineDecisionModal({
  open, onClose, onSubmit,
}: Readonly<{ open: boolean; onClose: () => void; onSubmit: (d: DeclineSubmission) => Promise<void> }>) {
  const [code, setCode] = useState<string>("")
  const [text, setText] = useState("")
  const [adverse, setAdverse] = useState<Set<string>>(new Set())
  const [showFactors, setShowFactors] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isDiscretion = code === DECLINE_AGENT_DISCRETION_CODE
  const textLen = text.trim().length
  const textOk = !isDiscretion || textLen >= DISCRETION_MIN_TEXT_LENGTH
  const canSubmit = code !== "" && textOk && !submitting

  function toggleFactor(c: string) {
    setAdverse((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      return next
    })
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        declineReasonCode: code as DeclineReasonCode,
        adverseFactorCodes: [...adverse] as AdverseFactorCode[],
        declineReasonText: isDiscretion ? text.trim() : null,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decline application"
      actions={
        <>
          <ActionButton tone="secondary" onClick={onClose}>Cancel</ActionButton>
          <ActionButton tone="destructive" onClick={submit} disabled={!canSubmit}>
            {submitting ? "Declining…" : "Decline"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Reason" required value={code} onChange={setCode} options={REASON_OPTIONS} span />

        {isDiscretion && (
          <div className="space-y-1">
            <TextareaField
              label={`Explanation (required, min ${DISCRETION_MIN_TEXT_LENGTH} characters)`}
              value={text}
              onChange={setText}
              rows={4}
              placeholder="Document the specific reason this decline falls outside the standard reasons."
            />
            <p className={`text-xs ${textOk ? "text-muted-foreground" : "text-destructive"}`}>
              {textLen}/{DISCRETION_MIN_TEXT_LENGTH} characters
            </p>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowFactors((s) => !s)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showFactors ? "▾" : "▸"} Contributing factors (optional){adverse.size > 0 ? ` · ${adverse.size} selected` : ""}
          </button>
          {showFactors && (
            <div className="max-h-48 overflow-y-auto rounded-[var(--r-button)] border border-border p-2 space-y-1">
              {ADVERSE_OPTIONS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={adverse.has(c)} onChange={() => toggleFactor(c)} />
                  {ADVERSE_FACTOR_LABELS[c]}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
