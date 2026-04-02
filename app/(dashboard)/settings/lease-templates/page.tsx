"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { LeaseBrandingSection } from "@/components/leases/LeaseBrandingSection"
import { LeasePreview } from "@/components/leases/LeasePreview"
import Link from "next/link"
import { toast } from "sonner"
import { Eye, ExternalLink } from "lucide-react"

interface OrgInfo {
  orgId: string
  clauseEditConfirmedAt: string | null
  customTemplateActive: boolean
}

export default function LeaseTemplatesPage() {
  const [clauseSubTab, setClauseSubTab] = useState("residential")
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [showConfirmRecord, setShowConfirmRecord] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [templateConfirmed, setTemplateConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadOrg() {
      const orgRes = await fetch("/api/org/info")
      if (orgRes.ok) {
        const org = await orgRes.json()
        setOrgInfo({
          orgId: org.orgId,
          clauseEditConfirmedAt: org.clauseEditConfirmedAt ?? null,
          customTemplateActive: org.customTemplateActive ?? false,
        })
      }
    }
    loadOrg()
  }, [])

  // Immediate save per toggle — called only on real user toggles, not on initial load.
  const handleToggleSave = useCallback(async (selections: Record<string, boolean>): Promise<boolean> => {
    const updates = Object.entries(selections).map(([clause_key, enabled]) => ({ clause_key, enabled }))
    const res = await fetch("/api/leases/org-clause-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    })
    if (!res.ok) toast.error("Failed to save clause defaults")
    return res.ok
  }, [])

  const onResidentialToggleSave = useCallback(
    (s: Record<string, boolean>) => handleToggleSave(s),
    [handleToggleSave]
  )
  const onCommercialToggleSave = useCallback(
    (s: Record<string, boolean>) => handleToggleSave(s),
    [handleToggleSave]
  )

  async function handleSubmitRequest() {
    if (!file || !orgInfo) return
    setLoading(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("notes", notes)

    const res = await fetch("/api/leases/custom-template-request", {
      method: "POST",
      body: formData,
    })

    setLoading(false)
    if (res.ok) {
      toast.success("Request submitted — we'll be in touch within 1 business day.")
      setShowRequestForm(false)
      setNotes("")
      setFile(null)
      setTemplateConfirmed(false)
    } else {
      toast.error("Failed to submit request")
    }
  }

  return (
    <div>
      <h1 className="font-heading text-3xl mb-2">Master lease template</h1>
      <p className="text-muted-foreground text-sm mb-1">
        Your approved lease with all clauses. Unit-specific clause toggles are configured on each unit&apos;s detail page.
      </p>
      <p className="text-muted-foreground text-xs mb-6">
        Changes to wording or org-level defaults cascade to all future leases. Unit profiles only override which optional clauses are included.
      </p>

      {/* 1. Lease branding */}
      <LeaseBrandingSection />

      {/* Confirmation status */}
      {orgInfo?.clauseEditConfirmedAt && (
        <div className="flex items-center justify-between mt-6 mb-4 text-xs text-muted-foreground border-b border-border/40 pb-3">
          <span>
            Custom clause editing enabled — you accepted responsibility on{" "}
            {new Date(orgInfo.clauseEditConfirmedAt).toLocaleDateString("en-ZA", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-auto py-0"
            onClick={() => setShowConfirmRecord(true)}
          >
            View record
          </Button>
        </div>
      )}

      {/* 2. Clause configurator */}
      <div className={orgInfo?.clauseEditConfirmedAt ? "" : "mt-8"}>
        <Tabs value={clauseSubTab} onValueChange={setClauseSubTab}>
          <div className="flex items-center justify-between mb-1">
            <TabsList>
              <TabsTrigger value="residential">Residential</TabsTrigger>
              <TabsTrigger value="commercial">Commercial</TabsTrigger>
            </TabsList>
            <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
              <Eye className="size-4 mr-1.5" /> Preview lease
            </Button>
          </div>

          <TabsContent value="residential" className="mt-4">
            <ClauseConfigurator
              leaseType="residential"
              onSelectionsChange={() => {}}
              onToggleSave={onResidentialToggleSave}
            />
          </TabsContent>

          <TabsContent value="commercial" className="mt-4">
            <ClauseConfigurator
              leaseType="commercial"
              onSelectionsChange={() => {}}
              onToggleSave={onCommercialToggleSave}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* 3. Annexures — informational */}
      <Card className="mt-8">
        <CardContent className="pt-5">
          <h2 className="font-semibold text-sm mb-1">Annexures</h2>
          <p className="text-xs text-muted-foreground mb-4">
            These annexures are appended to every lease. Their content is filled from your
            property and lease data — they don&apos;t need separate template configuration.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-muted-foreground w-6 shrink-0 pt-0.5">A</span>
              <div>
                <p className="text-sm font-medium">Rental calculation</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Auto-generated from lease terms — rent, deposit, escalation, charges.
                  No configuration needed.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-muted-foreground w-6 shrink-0 pt-0.5">B</span>
              <div>
                <p className="text-sm font-medium">Banking details</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pulled from your trust account settings.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-brand mt-1"
                  render={<Link href="/settings/compliance" />}
                >
                  Configure banking <ExternalLink className="size-3 ml-1" />
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-muted-foreground w-6 shrink-0 pt-0.5">C</span>
              <div>
                <p className="text-sm font-medium">Property rules</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set per property. Each property can have its own rules for pets,
                  smoking, parking, noise, and common areas.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-brand mt-1"
                  render={<Link href="/properties" />}
                >
                  Manage property rules <ExternalLink className="size-3 ml-1" />
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-muted-foreground w-6 shrink-0 pt-0.5">D</span>
              <div>
                <p className="text-sm font-medium">Special agreements</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Added during lease creation. Covers unit-specific arrangements
                  like pet permissions, parking allocations, and custom terms.
                  No template configuration needed.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Custom lease configuration CTA */}
      {orgInfo?.customTemplateActive ? (
        <Card className="border-brand/30 mt-8">
          <CardContent className="pt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-sm font-medium">Custom lease template active</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(
                "mailto:support@pleks.co.za?subject=Custom lease update request",
                "_blank"
              )}
            >
              Request update
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-brand/30 mt-8">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Need a fully custom lease?</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-sm">
                  If your organisation uses a bespoke lease agreement,
                  we can configure it for you. We&apos;ll set up your
                  custom clause wording so it generates correctly
                  with all your tenant and property details pre-filled.
                </p>
                <p className="text-xs text-brand mt-2 font-medium">
                  Once-off configuration fee: R 1,000 excl. VAT
                </p>
              </div>
              {!showRequestForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setShowRequestForm(true)}
                >
                  Request configuration
                </Button>
              )}
            </div>

            {showRequestForm && (
              <div className="mt-4 space-y-4 border-t border-border/40 pt-4">
                <div className="space-y-2">
                  <Label>Tell us about your lease template</Label>
                  <textarea
                    placeholder="e.g. We use a commercial lease with custom service level clauses and a revenue share arrangement..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Upload your lease template (.docx)</Label>
                  <Input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">Word document (.docx) only. Maximum 10MB.</p>
                </div>

                <div className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
                  <input
                    type="checkbox"
                    id="custom-template-confirm"
                    checked={templateConfirmed}
                    onChange={(e) => setTemplateConfirmed(e.target.checked)}
                    className="mt-1 accent-brand size-4 shrink-0 cursor-pointer"
                  />
                  <label htmlFor="custom-template-confirm" className="text-sm leading-relaxed cursor-pointer">
                    I confirm that this lease agreement has been reviewed by a qualified property attorney
                    and complies with the Rental Housing Act 50 of 1999, the Consumer Protection Act 68 of 2008,
                    and all applicable South African legislation. I accept full responsibility for the legal
                    content of this document.
                  </label>
                </div>

                <p className="text-xs text-muted-foreground">
                  Once received, we will review your template and send a payment link for the once-off
                  configuration fee of R 1,000 excl. VAT. Configuration is typically completed within
                  3 business days of payment.
                </p>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowRequestForm(false)}>Cancel</Button>
                  <Button
                    disabled={!templateConfirmed || !file || loading}
                    onClick={handleSubmitRequest}
                  >
                    {loading ? "Submitting..." : "Submit request"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation record dialog */}
      <Dialog open={showConfirmRecord} onOpenChange={setShowConfirmRecord}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clause edit confirmation record</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Date confirmed</p>
              <p>{orgInfo?.clauseEditConfirmedAt
                ? new Date(orgInfo.clauseEditConfirmedAt).toLocaleString("en-ZA")
                : "—"
              }</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mt-3">Confirmation text agreed to</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed bg-surface rounded-md p-3">
                &quot;I confirm that any changes I make to lease clause wording have been reviewed by a
                qualified property attorney and comply with the Rental Housing Act 50 of 1999,
                the Consumer Protection Act 68 of 2008, and all applicable South African legislation.
                I accept full responsibility for the legal content of clauses I edit.&quot;
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lease preview dialog */}
      <LeasePreview
        open={showPreview}
        onOpenChange={setShowPreview}
        leaseType={clauseSubTab}
      />
    </div>
  )
}
