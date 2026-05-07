"use client"

/**
 * app/(public)/public/notice/[token]/NoticeAcknowledge.tsx — acknowledge button
 *
 * Auth:   public (no session)
 * Data:   acknowledgeNotice server action
 * Notes:  Tracks "mark as read" confirmation for mandatory notice delivery audit.
 */

import { useState } from "react"
import { acknowledgeNotice } from "@/lib/actions/delivery-notice"
import { CheckCircle2 } from "lucide-react"

interface Props {
  token: string
  alreadyAcknowledged: boolean
}

export function NoticeAcknowledge({ token, alreadyAcknowledged }: Props) {
  const [done, setDone] = useState(alreadyAcknowledged)
  const [loading, setLoading] = useState(false)

  async function handleAcknowledge() {
    setLoading(true)
    await acknowledgeNotice(token)
    setLoading(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        You have acknowledged receipt of this notice. This has been recorded.
      </div>
    )
  }

  return (
    <button
      onClick={handleAcknowledge}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      <CheckCircle2 className="h-4 w-4" />
      {loading ? "Recording…" : "I have read this notice"}
    </button>
  )
}
