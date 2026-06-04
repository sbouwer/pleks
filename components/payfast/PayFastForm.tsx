/**
 * components/payfast/PayFastForm.tsx — Client-side PayFast payment form (auto-submits on click)
 *
 * Auth:   Public — form data is pre-signed by server before rendering
 * Notes:  Receives pre-built form data from buildApplicationFeeForm / buildDirectorFeeForm.
 *         Renders a button that triggers a hidden form POST to PayFast.
 */
"use client"

import { useRef, useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Loader2 } from "lucide-react"

interface Props {
  url: string
  data: Record<string, string>
  label?: string
}

export function PayFastForm({ url, data, label = "Pay securely →" }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [submitting, setSubmitting] = useState(false)

  function handlePay() {
    setSubmitting(true)
    formRef.current?.submit()
  }

  return (
    <>
      <form ref={formRef} method="post" action={url} style={{ display: "none" }}>
        {Object.entries(data).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>
      <ActionButton
        tone="primary"
        className="w-full h-12 text-base font-semibold"
        disabled={submitting}
        onClick={handlePay}
      >
        {submitting ? <><Loader2 className="size-4 animate-spin mr-2" />Redirecting to PayFast…</> : label}
      </ActionButton>
    </>
  )
}
