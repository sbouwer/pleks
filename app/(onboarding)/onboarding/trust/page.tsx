"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"

const BANK_OPTIONS = ["FNB", "ABSA", "Standard Bank", "Nedbank", "Capitec", "Other"]

type ManagementScope = "own_only" | "own_and_others" | "others_only" | null
type CompliancePhase = "scope" | "residential_account" | "ppra" | "ppra_trust"

export default function CompliancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useState<ManagementScope>(null)
  const [phase, setPhase] = useState<CompliancePhase>("scope")

  // Account fields
  const [hasAccount, setHasAccount] = useState<boolean | null>(null)
  const [bankName, setBankName] = useState("")
  const [accountHolder, setAccountHolder] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [branchCode, setBranchCode] = useState("")
  const [accountType, setAccountType] = useState("")

  // PPRA
  const [ppraStatus, setPpraStatus] = useState<string | null>(null)
  const [ppraFfc, setPpraFfc] = useState("")

  // Consent
  const [consentChecked, setConsentChecked] = useState(false)

  // Determine next phase after scope selection
  function handleScopeSelect(selectedScope: ManagementScope) {
    setScope(selectedScope)
    // Need to know property types to route correctly — fetch from org
    if (selectedScope === "own_only") {
      // Will check property types — for now route to residential account
      setPhase("residential_account")
    } else {
      setPhase("ppra")
    }
  }

  async function handleSubmit() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (!membership) return

    const orgId = membership.org_id
    const updates: Record<string, unknown> = { management_scope: scope }

    if (ppraStatus) {
      updates.ppra_status = ppraStatus
      if (ppraFfc) updates.ppra_ffc_number = ppraFfc
    }

    if (phase === "residential_account" || hasAccount !== null) {
      updates.has_deposit_account = hasAccount
      updates.deposit_account_type = hasAccount ? "interest_bearing" : "none"
    }

    if (phase === "ppra_trust") {
      updates.has_trust_account = hasAccount
      if (hasAccount) updates.trust_account_confirmed_at = new Date().toISOString()
    }

    await supabase.from("organisations").update(updates).eq("id", orgId)

    // Save bank account if provided
    if (hasAccount && bankName) {
      const type = ppraStatus === "registered" ? "ppra_trust" : "deposit_holding"
      await supabase.from("bank_accounts").insert({
        org_id: orgId,
        type,
        bank_name: bankName,
        account_holder: accountHolder,
        account_number: accountNumber || null,
        branch_code: branchCode || null,
        account_type: accountType || null,
      })
    }

    // Log consent if declining
    if (!hasAccount && consentChecked) {
      const consentType = "trust_account_notice"

      await supabase.from("consent_log").insert({
        org_id: orgId,
        user_id: user.id,
        consent_type: consentType,
        consent_given: true,
        consent_version: "1.0",
        metadata: {
          scope,
          feature_restrictions_acknowledged: true,
        },
      })
    }

    // Audit
    await supabase.from("audit_log").insert({
      org_id: orgId,
      table_name: "organisations",
      record_id: orgId,
      action: "UPDATE",
      changed_by: user.id,
      new_values: updates,
    })

    router.push("/onboarding/team")
  }

  // Phase: Scope selection
  if (phase === "scope") {
    return (
      <div>
        <h2 className="font-heading text-2xl mb-1">Who are you managing properties for?</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Includes informal arrangements — for example, helping a parent or sibling
          manage their rental properties.
        </p>
        <div className="space-y-3">
          {[
            { value: "own_only" as const, title: "Only my own properties", desc: "I own the properties I manage" },
            { value: "own_and_others" as const, title: "My own + properties for others", desc: "I manage my own portfolio and also manage on behalf of other landlords" },
            { value: "others_only" as const, title: "Only properties belonging to other people", desc: "I manage properties on behalf of landlords" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleScopeSelect(option.value)}
              className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
            >
              <p className="font-medium">{option.title}</p>
              <p className="text-sm text-muted-foreground">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Phase: PPRA registration
  if (phase === "ppra") {
    return (
      <div>
        <h2 className="font-heading text-2xl mb-1">Are you registered with the PPRA?</h2>
        <Card className="mb-6 border-info/30 bg-info-bg">
          <CardContent className="text-sm pt-4">
            The Property Practitioners Act 22 of 2019 requires anyone managing property
            on behalf of others to register with the PPRA and hold a valid Fidelity Fund
            Certificate (FFC).
          </CardContent>
        </Card>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setPpraStatus("registered"); setPhase("ppra_trust") }}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">Yes, I am registered</p>
          </button>
          <button
            type="button"
            onClick={() => { setPpraStatus("pending"); setHasAccount(false); setConsentChecked(false); setPhase("ppra_trust") }}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">No, but I&apos;m in the process</p>
          </button>
          <button
            type="button"
            onClick={() => { setPpraStatus("not_registered"); setHasAccount(false); setConsentChecked(false); setPhase("ppra_trust") }}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">No, and I don&apos;t plan to register</p>
          </button>
        </div>

        {ppraStatus === "registered" && (
          <div className="mt-4 space-y-2">
            <Label htmlFor="ppra_ffc">FFC Number (optional)</Label>
            <Input id="ppra_ffc" value={ppraFfc} onChange={(e) => setPpraFfc(e.target.value)} />
          </div>
        )}
      </div>
    )
  }

  // Phase: Account question (residential or PPRA trust)
  const isPPRAPath = phase === "ppra_trust"
  const accountLabel = isPPRAPath
    ? "Do you have a PPRA-registered trust account?"
    : "Do you have an interest-bearing account for holding tenant deposits?"

  const legalNotice = isPPRAPath
    ? "The Property Practitioners Act requires registered practitioners to hold ALL client funds in a separate trust account registered with the PPRA."
    : "The Rental Housing Act 50 of 1999 (s5) requires that tenant deposits be held in a separate interest-bearing account. This can be a simple savings account at any SA bank."

  const declineNotice = isPPRAPath
    ? "Pleks deposit receipts, reconciliation reports, and Tribunal documentation are only available to users with a confirmed trust account."
    : "Without an interest-bearing account, deposit receipts, reconciliation reports, and Tribunal documents will be restricted."

  return (
    <div>
      <h2 className="font-heading text-2xl mb-1">{accountLabel}</h2>
      <Card className="mb-6 border-info/30 bg-info-bg">
        <CardContent className="text-sm pt-4">{legalNotice}</CardContent>
      </Card>

      {hasAccount === null && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setHasAccount(true)}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">Yes, I have one</p>
          </button>
          <button
            type="button"
            onClick={() => setHasAccount(false)}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">Not yet / No</p>
          </button>
        </div>
      )}

      {hasAccount === true && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Bank Name *</Label>
            <Select value={bankName} onValueChange={(v) => setBankName(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
              <SelectContent>
                {BANK_OPTIONS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="holder">Account Holder Name *</Label>
            <Input id="holder" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accnum">Account Number</Label>
              <Input id="accnum" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Branch Code</Label>
              <Input id="branch" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={accountType} onValueChange={(v) => setAccountType(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value="cheque">Cheque / Current</SelectItem>
                <SelectItem value="transmission">Transmission</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={loading || !bankName || !accountHolder}>
            {loading ? "Saving..." : "Continue"}
          </Button>
        </div>
      )}

      {hasAccount === false && (
        <div className="mt-4 space-y-4">
          <Card className="border-warning/30 bg-warning-bg">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <p className="text-sm">{declineNotice}</p>
              </div>
            </CardContent>
          </Card>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              I understand the above legislation and the feature restrictions that apply
              until I add an account.
            </span>
          </label>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setHasAccount(null)} className="flex-1">
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={loading || !consentChecked}
            >
              {loading ? "Saving..." : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
