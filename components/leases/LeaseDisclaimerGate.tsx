"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { recordLeaseDisclaimerAcceptance } from "@/lib/actions/consent"
import { DISCLAIMER_GATE_TEXT } from "@/lib/leases/disclaimer"

// Structured sections for clean rendering
const SECTIONS = [
  {
    heading: "1. Templates, not legal advice",
    body: "The lease agreement templates, clauses, property rules, and annexures provided by Pleks are templates for your convenience. They are not legal advice and do not constitute a legal service. Pleks (Pty) Ltd is a technology platform, not a law firm, legal advisory service, or registered estate agency. No attorney-client or professional advisory relationship is created by your use of these templates.",
  },
  {
    heading: "2. Your responsibility to review and customise",
    body: "You are solely responsible for reviewing, customising, and ensuring the suitability of all lease content for your specific letting arrangement. You use the templates and any generated content at your own discretion and risk. You should not rely on these templates without verifying that they meet your specific needs and the requirements of the property in question, including any Body Corporate or Homeowners' Association rules.",
  },
  {
    heading: "3. No guarantee of legal compliance",
    body: "While these clauses reference the Rental Housing Act 50 of 1999 and the Consumer Protection Act 68 of 2008, Pleks makes no representation or warranty that the templates are current with all legislative amendments, that they comply with all applicable laws in every circumstance, or that any provision will be enforceable in all circumstances in a court or Tribunal. Compliance depends entirely on the specific facts and context of your rental agreement.",
  },
  {
    heading: "4. User-generated and AI-formatted content",
    body: "Any content you add, edit, or format — whether manually or using AI-assisted tools — is your sole responsibility. Pleks does not review, verify, or endorse user-modified content. AI-assisted formatting is a text-processing tool only and does not constitute legal drafting, legal review, or legal advice.",
  },
  {
    heading: "5. Limitation of liability",
    body: "To the fullest extent permitted by law, Pleks (Pty) Ltd accepts no liability for any indirect, consequential, or incidental loss, and any direct loss to the extent arising from or in connection with your use of the platform's templates or AI tools. This includes, without limitation, any claim by a tenant, co-lessee, or regulatory authority. Nothing in this disclaimer seeks to exclude liability for gross negligence or wilful misconduct as prohibited by the Consumer Protection Act.",
  },
  {
    heading: "6. Independent legal advice",
    body: "You are strongly advised to obtain independent legal advice before using these templates, particularly where you have customised terms, where the arrangement is complex, or where you are unsure of your obligations under South African law.",
  },
]

interface Props {
  children: React.ReactNode
  /** Pass from server component to avoid client-side fetch. Omit to let gate check itself. */
  initialAccepted?: boolean
}

export function LeaseDisclaimerGate({ children, initialAccepted }: Props) {
  const [status, setStatus] = useState<"loading" | "accepted" | "pending">(() => {
    if (initialAccepted === true) return "accepted"
    if (initialAccepted === false) return "pending"
    return "loading"
  })
  const [canAccept, setCanAccept] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialAccepted !== undefined) return
    fetch("/api/consent/lease-disclaimer")
      .then((r) => r.json())
      .then(({ accepted }: { accepted: boolean }) =>
        setStatus(accepted ? "accepted" : "pending")
      )
      .catch(() => setStatus("pending"))
  }, [initialAccepted])

  function handleScroll() {
    const el = scrollRef.current
    if (!el || canAccept) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setCanAccept(true)
    }
  }

  async function handleAccept() {
    setAccepting(true)
    await recordLeaseDisclaimerAcceptance()
    setStatus("accepted")
  }

  if (status === "accepted") return <>{children}</>

  return (
    <>
      {/* Page content — rendered but non-interactive behind the modal */}
      <div className="pointer-events-none select-none opacity-40 blur-[2px]" aria-hidden>
        {children}
      </div>

      {/* Full-screen modal overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-8">
        <div className="w-full max-w-2xl bg-card border rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="px-6 py-5 border-b shrink-0">
            <h2 className="text-base font-semibold">Lease Template Disclaimer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Please read carefully and scroll to the bottom to accept.
            </p>
          </div>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm leading-relaxed"
          >
            <p className="text-muted-foreground">
              The lease templates, clauses, and annexures on this platform have been professionally
              drafted with input from qualified South African attorneys and are maintained at the cost
              of Pleks (Pty) Ltd. They have been prepared with the intention of being legally sound
              and aligned with current South African rental legislation. However, no template can
              account for every letting arrangement, and the following terms apply to your use of
              this content:
            </p>

            {SECTIONS.map((s) => (
              <div key={s.heading}>
                <p className="font-semibold text-foreground mb-1">{s.heading}</p>
                <p className="text-muted-foreground">{s.body}</p>
              </div>
            ))}

            <p className="text-muted-foreground">
              This disclaimer forms part of, and should be read with, the Pleks Terms of Service.
            </p>

            {/* Sentinel — reaching here enables the accept button */}
            <p className="font-semibold text-foreground pt-2">
              By clicking &ldquo;I accept,&rdquo; you acknowledge that you have read and understood this
              disclaimer and accept full responsibility for such use.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {canAccept
                ? "You can now accept the disclaimer."
                : "Scroll to the bottom to enable acceptance."}
            </p>
            <Button
              onClick={handleAccept}
              disabled={!canAccept || accepting}
              size="sm"
            >
              {accepting ? "Recording…" : "I accept"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
