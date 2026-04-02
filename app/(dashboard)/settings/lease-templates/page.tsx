"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { toast } from "sonner"

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
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const initializedRef = useRef<Record<string, boolean>>({ residential: false, commercial: false })
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSelectionsChange = useCallback((leaseType: string, selections: Record<string, boolean>) => {
    // Skip the initial population call — only save user-triggered changes
    if (!initializedRef.current[leaseType]) {
      initializedRef.current[leaseType] = true
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus("saving")
    saveTimerRef.current = setTimeout(async () => {
      const updates = Object.entries(selections).map(([clause_key, enabled]) => ({ clause_key, enabled }))
      const res = await fetch("/api/leases/org-clause-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      })
      setSaveStatus(res.ok ? "saved" : "idle")
      if (!res.ok) toast.error("Failed to save clause defaults")
      if (res.ok) setTimeout(() => setSaveStatus("idle"), 2000)
    }, 800)
  }, [])
  const [templateConfirmed, setTemplateConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadOrg() {
      const res = await fetch("/api/leases/clause-library?type=residential")
      if (!res.ok) return
      const data = await res.json()
      // Fetch org info separately
      const orgRes = await fetch("/api/org/info")
      if (orgRes.ok) {
        const org = await orgRes.json()
        setOrgInfo({
          orgId: org.orgId ?? data.orgId,
          clauseEditConfirmedAt: org.clauseEditConfirmedAt ?? null,
          customTemplateActive: org.customTemplateActive ?? false,
        })
      } else {
        setOrgInfo({ orgId: data.orgId, clauseEditConfirmedAt: null, customTemplateActive: false })
      }
    }
    loadOrg()
  }, [])

  async function handleSubmitRequest() {
    if (!file || !orgInfo) return
    setLoading(true)

    // Upload file to Supabase Storage via API
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

      {/* Confirmation status */}
      {orgInfo?.clauseEditConfirmedAt && (
        <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground border-b border-border/40 pb-3">
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

      <Tabs value={clauseSubTab} onValueChange={setClauseSubTab}>
        <div className="flex items-center justify-between mb-1">
          <TabsList>
            <TabsTrigger value="residential">Residential</TabsTrigger>
            <TabsTrigger value="commercial">Commercial</TabsTrigger>
          </TabsList>
          {saveStatus === "saving" && <p className="text-xs text-muted-foreground">Saving...</p>}
          {saveStatus === "saved" && <p className="text-xs text-brand">Saved</p>}
        </div>

        <TabsContent value="residential" className="mt-4">
          <ClauseConfigurator
            leaseType="residential"
            onSelectionsChange={(s) => handleSelectionsChange("residential", s)}
          />
        </TabsContent>

        <TabsContent value="commercial" className="mt-4">
          <ClauseConfigurator
            leaseType="commercial"
            onSelectionsChange={(s) => handleSelectionsChange("commercial", s)}
          />
        </TabsContent>
      </Tabs>

      {/* Custom lease configuration CTA */}
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
    </div>
  )
}
