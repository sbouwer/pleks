"use client"

import { useState, useEffect, useCallback } from "react"
import { LeaseDisclaimerGate } from "@/components/leases/LeaseDisclaimerGate"
import { LeaseTemplateIntro } from "@/components/leases/LeaseTemplateIntro"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ClauseConfigurator } from "@/components/leases/ClauseConfigurator"
import { LeasePreview } from "@/components/leases/LeasePreview"
import Link from "next/link"
import { toast } from "sonner"
import { Eye, ExternalLink, Info } from "lucide-react"

interface OrgInfo {
  orgId: string
  clauseEditConfirmedAt: string | null
  customTemplateActive: boolean
  brandLogoPath: string | null
  brandAccentColor: string | null
}

export default function LeaseTemplatesPage() {
  const [leaseType, setLeaseType] = useState("residential")
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [showConfirmRecord, setShowConfirmRecord] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [templateConfirmed, setTemplateConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tier, setTier] = useState<string | null>(null)
  const [showIntro, setShowIntro] = useState(false)

  useEffect(() => {
    async function loadOrg() {
      const [infoRes, brandRes, prefRes] = await Promise.all([
        fetch("/api/org/info"),
        fetch("/api/org/brand"),
        fetch("/api/user/preferences"),
      ])
      if (infoRes.ok) {
        const org = await infoRes.json()
        const brand = brandRes.ok ? await brandRes.json() : {}
        setOrgInfo({
          orgId: org.orgId,
          clauseEditConfirmedAt: org.clauseEditConfirmedAt ?? null,
          customTemplateActive: org.customTemplateActive ?? false,
          brandLogoPath: brand.brand_logo_path ?? null,
          brandAccentColor: brand.brand_accent_color ?? null,
        })
      }
      if (prefRes.ok) {
        const { preferences, tier: t } = await prefRes.json() as { preferences: Record<string, unknown>; tier: string | null }
        setTier(t)
        setShowIntro(!preferences.dismissed_lease_intro)
      }
    }
    loadOrg()
  }, [])

  async function handleDismissIntro() {
    setShowIntro(false)
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "dismissed_lease_intro", value: true }),
    })
  }

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

  const onToggleSave = useCallback(
    (s: Record<string, boolean>) => handleToggleSave(s),
    [handleToggleSave]
  )

  async function handleSubmitRequest() {
    if (!file || !orgInfo) return
    setLoading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("notes", notes)
    const res = await fetch("/api/leases/custom-template-request", { method: "POST", body: formData })
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
    <LeaseDisclaimerGate>
    <div>
      <h1 className="font-heading text-3xl mb-2">Master lease template</h1>
      <p className="text-muted-foreground text-sm mb-1">
        Your approved lease with all clauses. Unit-specific clause toggles are configured on each unit&apos;s detail page.
      </p>
      <p className="text-muted-foreground text-xs mb-3">
        Changes to wording or org-level defaults cascade to all future leases. Unit profiles only override which optional clauses are included.
      </p>
      <p className="text-xs text-muted-foreground mb-6">
        For property-specific house rules, edit them on each{" "}
        <Link href="/properties" className="text-brand hover:underline">property&rsquo;s edit page</Link>.
        {" "}For unit-specific clause overrides, edit them on each unit&rsquo;s detail page.
      </p>

      {showIntro && <LeaseTemplateIntro tier={tier} onDismiss={handleDismissIntro} />}

      {/* Confirmation status bar */}
      {orgInfo?.clauseEditConfirmedAt && (
        <div className="flex items-center justify-between mt-6 mb-4 text-xs text-muted-foreground border-b border-border/40 pb-3">
          <span>
            Custom clause editing enabled — you accepted responsibility on{" "}
            {new Date(orgInfo.clauseEditConfirmedAt).toLocaleDateString("en-ZA", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </span>
          <Button variant="ghost" size="sm" className="text-xs h-auto py-0" onClick={() => setShowConfirmRecord(true)}>
            View record
          </Button>
        </div>
      )}

      <div className={orgInfo?.clauseEditConfirmedAt ? "" : "mt-8"}>
        {/* Branding warning */}
        {orgInfo && !orgInfo.brandLogoPath && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 mb-3 text-xs text-amber-600/80">
            <Info className="size-3.5 shrink-0 mt-0.5" />
            <span>
              Your branding isn&apos;t configured yet.{" "}
              <Link href="/settings/branding" className="underline underline-offset-2 font-medium">
                Set up your logo and colours
              </Link>
              {" "}to see them on the preview.
            </span>
          </div>
        )}

        {/* Lease type toggle + preview button — above sub-tabs */}
        <div className="flex items-center justify-between mb-4">
          <Tabs value={leaseType} onValueChange={setLeaseType}>
            <TabsList>
              <TabsTrigger value="residential">Residential</TabsTrigger>
              <TabsTrigger value="commercial">Commercial</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="size-4 mr-1.5" /> Preview lease
          </Button>
        </div>

        {/* Sub-tabs */}
        <Tabs defaultValue="required">
          <TabsList className="mb-4">
            <TabsTrigger value="required">Required clauses</TabsTrigger>
            <TabsTrigger value="optional">Optional clauses</TabsTrigger>
            <TabsTrigger value="annexures">Annexures</TabsTrigger>
            <TabsTrigger value="custom">Custom lease</TabsTrigger>
          </TabsList>

          <TabsContent value="required">
            <ClauseConfigurator
              leaseType={leaseType}
              onSelectionsChange={() => {}}
              onToggleSave={onToggleSave}
              view="required"
            />
          </TabsContent>

          <TabsContent value="optional">
            <ClauseConfigurator
              leaseType={leaseType}
              onSelectionsChange={() => {}}
              onToggleSave={onToggleSave}
              view="optional"
            />
          </TabsContent>

          <TabsContent value="annexures">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground mb-4">
                  These annexures are appended to every lease. Their content is filled from your
                  property and lease data — they don&apos;t need separate template configuration.
                </p>
                <div className="space-y-4">
                  {[
                    { label: "A", title: "Rental calculation", desc: "Auto-generated from lease terms — rent, deposit, escalation, charges. No configuration needed.", link: null },
                    { label: "B", title: "Banking details", desc: "Pulled from your trust account settings.", link: { href: "/settings/compliance", text: "Configure banking" } },
                    { label: "C", title: "Property rules", desc: "Set per property. Each property can have its own rules for pets, smoking, parking, noise, and common areas.", link: { href: "/properties", text: "Manage property rules" } },
                    { label: "D", title: "Special agreements", desc: "Added during lease creation. Covers unit-specific arrangements like pet permissions, parking allocations, and custom terms. No template configuration needed.", link: null },
                  ].map((a) => (
                    <div key={a.label} className="flex items-start gap-3">
                      <span className="text-xs font-medium text-muted-foreground w-6 shrink-0 pt-0.5">{a.label}</span>
                      <div>
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                        {a.link && (
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-brand mt-1"
                            render={<Link href={a.link.href} />}>
                            {a.link.text} <ExternalLink className="size-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom">
            {orgInfo?.customTemplateActive ? (
              <Card className="border-brand/30">
                <CardContent className="pt-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <p className="text-sm font-medium">Custom lease template active</p>
                  </div>
                  <Button variant="outline" size="sm"
                    onClick={() => window.open("mailto:support@pleks.co.za?subject=Custom lease update request", "_blank")}>
                    Request update
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-brand/30">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">Need a fully custom lease?</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-sm">
                        If your organisation uses a bespoke lease agreement, we can configure it for you.
                        We&apos;ll set up your custom clause wording so it generates correctly with all your
                        tenant and property details pre-filled.
                      </p>
                      <p className="text-xs text-brand mt-2 font-medium">Once-off configuration fee: R 1,000 excl. VAT</p>
                    </div>
                    {!showRequestForm && (
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowRequestForm(true)}>
                        Request configuration
                      </Button>
                    )}
                  </div>

                  {showRequestForm && (
                    <div className="mt-4 space-y-4 border-t border-border/40 pt-4">
                      <div className="space-y-2">
                        <Label>Tell us about your lease template</Label>
                        <textarea
                          placeholder="e.g. We use a commercial lease with custom service level clauses..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Upload your lease template (.docx)</Label>
                        <Input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        <p className="text-xs text-muted-foreground">Word document (.docx) only. Maximum 10MB.</p>
                      </div>
                      <div className="flex items-start gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
                        <input type="checkbox" id="custom-template-confirm" checked={templateConfirmed}
                          onChange={(e) => setTemplateConfirmed(e.target.checked)}
                          className="mt-1 accent-brand size-4 shrink-0 cursor-pointer" />
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
                        <Button disabled={!templateConfirmed || !file || loading} onClick={handleSubmitRequest}>
                          {loading ? "Submitting..." : "Submit request"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
      <LeasePreview open={showPreview} onOpenChange={setShowPreview} leaseType={leaseType} />
    </div>
    </LeaseDisclaimerGate>
  )
}
