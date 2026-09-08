/**
 * app/(applicant)/apply/[slug]/directors/DirectorDeclarationForm.tsx — the Step 1.5 declaration form
 *
 * Auth:   public — the lead token is validated by the parent server page and again by the API route
 * Data:   POST /api/applications/director-declaration
 * Notes:  ADDENDUM_14G §3.2/§3.3. Director 1 is the primary contact, shown locked: the values here
 *         are DISPLAY ONLY and are not submitted — the route re-derives them from the application
 *         row, because a disabled input is a styling choice and not a boundary. The one thing the
 *         primary contact decides is their own surety tick (§3.3's "authorised representative" case).
 *
 *         The cost box is computed from screeningFeeCents, never written as a literal — the 14B
 *         wireframe this page follows still quotes "R250 Standard / R400 Estate", and Estate was
 *         cancelled. A wireframe is a layout, not a price list.
 */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Field, FieldGrid, TextField } from "@/components/forms/fields"
import { ActionButton } from "@/components/ui/actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import { APPLICATION_FEE_CENTS, formatZAR, screeningFeeCents } from "@/lib/constants"

interface PrimaryContact {
  firstName: string
  lastName: string
  email: string
  /** Masked — the raw ID never leaves the server. */
  idMasked: string
}

interface Props {
  applicationId: string
  token: string
  slug: string
  companyName: string
  companyType: string | null
  /** "director" for a company, "trustee" for a trust — never hardcoded (juristicParties). */
  partyLabel: string
  alreadyDeclared: boolean
  primary: PrimaryContact
}

interface ExtraDirector {
  firstName: string
  lastName: string
  idNumber: string
  email: string
  phone: string
  isSigningSurety: boolean
}

/** A Step-1 value shown back to the applicant for recognition — display only, never submitted. */
function LockedValue({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Field label={label}>
      <p className="text-sm text-muted-foreground py-2 min-h-9">{value || "—"}</p>
    </Field>
  )
}

function blankDirector(): ExtraDirector {
  // Surety defaults to ticked — the wireframe's default and the overwhelmingly common case. It is a
  // declaration the applicant can untick, not a pre-consent: consent is separate and per-person.
  return { firstName: "", lastName: "", idNumber: "", email: "", phone: "", isSigningSurety: true }
}

export function DirectorDeclarationForm({
  applicationId, token, slug, companyName, companyType, partyLabel, alreadyDeclared, primary,
}: Readonly<Props>) {
  const router = useRouter()
  const [primarySurety, setPrimarySurety] = useState(true)
  const [extras, setExtras] = useState<ExtraDirector[]>([blankDirector()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plural = `${partyLabel}s`
  const suretyCount = (primarySurety ? 1 : 0) + extras.filter((d) => d.isSigningSurety).length
  const totalCents = screeningFeeCents({ isJuristic: true, suretyCount, hasCoApplicant: false })

  function updateExtra(i: number, patch: Partial<ExtraDirector>) {
    setExtras((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  async function handleSubmit() {
    setError(null)

    if (suretyCount < 1) {
      setError(`At least one ${partyLabel} must sign personal surety before the application can continue.`)
      return
    }

    setSubmitting(true)
    const res = await fetch("/api/applications/director-declaration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId,
        token,
        // Slot 0 carries ONLY the surety decision. Its identity fields are deliberately absent — the
        // route reads them from the application, so there is nothing here to tamper with.
        directors: [{ isSigningSurety: primarySurety }, ...extras.filter((d) => d.firstName.trim() || d.email.trim())],
      }),
    })

    if (res.ok) {
      // 14G §3.4(6) redirects to /company-payment/[token]. That page is 14G Phase 4 and does not
      // exist yet; /co-parties is the built surface that shows the lines just created, so a
      // completed declaration lands somewhere real instead of on a 404. Change this to the
      // company-payment route the moment Phase 4 ships.
      router.push(`/apply/${slug}/co-parties?token=${encodeURIComponent(token)}`)
      return
    }

    const body = await res.json().catch(() => ({})) as { error?: string }
    setError(body.error ?? "Something went wrong. Please try again.")
    setSubmitting(false)
  }

  if (alreadyDeclared) {
    return (
      <Card>
        <CardContent className="pt-5 space-y-4 text-sm">
          <p>
            The {plural} for this application have already been declared. Each one signing surety has been
            emailed their own private link.
          </p>
          <ActionButton
            tone="primary"
            onClick={() => router.push(`/apply/${slug}/co-parties?token=${encodeURIComponent(token)}`)}
          >
            View application progress →
          </ActionButton>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-2 text-sm text-muted-foreground">
          <p>
            Please list every {partyLabel} of <span className="font-medium text-foreground">{companyName}</span>.
          </p>
          {companyType === "trust" ? (
            <p>You can find them on your trust deed or the Master&apos;s letters of authority.</p>
          ) : (
            <p>
              You can find them on your CIPC company registration documents, or at{" "}
              <a href="https://www.cipc.co.za" target="_blank" rel="noopener noreferrer" className="underline">
                cipc.co.za
              </a>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Director 1 — the primary contact, locked */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base capitalize">
            {partyLabel} 1 <span className="text-muted-foreground font-normal normal-case">(you)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Rendered as text, not as disabled inputs. A disabled input still looks editable-ish and
              still round-trips a value; these are read-only facts from Step 1 that are never sent. */}
          <FieldGrid>
            <LockedValue label="First name" value={primary.firstName} />
            <LockedValue label="Last name" value={primary.lastName} />
            <LockedValue label="ID number" value={primary.idMasked} />
            <LockedValue label="Email" value={primary.email} />
          </FieldGrid>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={primarySurety}
              onChange={(e) => setPrimarySurety(e.target.checked)}
              className="mt-0.5 size-4 rounded border-border accent-foreground cursor-pointer"
            />
            <span>
              I am signing personal surety for the lease.
              <span className="block text-muted-foreground text-xs mt-0.5">
                Untick this only if you are submitting on the company&apos;s behalf and are not personally
                a {partyLabel} standing surety.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Additional directors */}
      {extras.map((d, i) => (
        <Card key={i}>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base capitalize">{partyLabel} {i + 2}</CardTitle>
            {extras.length > 1 && (
              <button
                type="button"
                onClick={() => setExtras((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${partyLabel} ${i + 2}`}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGrid>
              <TextField label="First name" value={d.firstName} onChange={(v) => updateExtra(i, { firstName: v })} required />
              <TextField label="Last name" value={d.lastName} onChange={(v) => updateExtra(i, { lastName: v })} required />
              <TextField label="ID number" value={d.idNumber} onChange={(v) => updateExtra(i, { idNumber: v })} maxLength={13} />
              <TextField label="Email" type="email" value={d.email} onChange={(v) => updateExtra(i, { email: v })} required />
              <TextField label="Phone" type="tel" value={d.phone} onChange={(v) => updateExtra(i, { phone: v })} />
            </FieldGrid>

            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={d.isSigningSurety}
                onChange={(e) => updateExtra(i, { isSigningSurety: e.target.checked })}
                className="mt-0.5 size-4 rounded border-border accent-foreground cursor-pointer"
              />
              <span>This {partyLabel} is signing personal surety for the lease.</span>
            </label>
          </CardContent>
        </Card>
      ))}

      <ActionButton tone="secondary" onClick={() => setExtras((prev) => [...prev, blankDirector()])}>
        <Plus className="size-3.5 mr-1.5" />
        Add another {partyLabel}
      </ActionButton>

      {/* POPIA + cost disclosure */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-yellow-600" />
            <CardTitle className="text-base">Important about personal surety</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Each {partyLabel} signing personal surety will need to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
            <li>Pay their own screening fee</li>
            <li>Give their own POPIA consent for credit checks</li>
            <li>Upload their own bank statement for income verification</li>
          </ul>
          <p className="text-muted-foreground">
            Each {partyLabel} is emailed a private link to complete their portion. You cannot complete it
            on their behalf — consent must come from the person themselves (POPIA).
          </p>

          <div className="border-t border-border pt-3 space-y-1">
            <p className="font-medium">Total for this application</p>
            <div className="flex justify-between text-muted-foreground">
              <span>Company line</span>
              <span className="tabular-nums">{formatZAR(APPLICATION_FEE_CENTS)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{suretyCount} {suretyCount === 1 ? partyLabel : plural} signing surety</span>
              <span className="tabular-nums">{formatZAR(APPLICATION_FEE_CENTS * suretyCount)}</span>
            </div>
            <div className="flex justify-between font-medium pt-1 border-t border-border">
              <span>Total</span>
              <span className="tabular-nums">{formatZAR(totalCents)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ActionButton
        tone="primary"
        className="w-full"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? "Saving…" : "Continue →"}
      </ActionButton>
    </div>
  )
}
