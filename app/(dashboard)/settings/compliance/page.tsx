"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Check, AlertTriangle, Loader2 } from "lucide-react"

const SCOPE_OPTIONS = [
  { value: "own_only", label: "Private landlord — I manage my own properties" },
  { value: "own_and_others", label: "Hybrid — I manage my own and clients' properties" },
  { value: "others_only", label: "Property agent / manager — clients' properties only" },
]

const PPRA_OPTIONS = [
  { value: "registered", label: "Registered" },
  { value: "pending", label: "Registration in progress" },
  { value: "not_registered", label: "Not registered" },
  { value: "unknown", label: "Not specified" },
]

const PROPERTY_TYPE_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed", label: "Mixed use" },
]

const BANK_TYPE_OPTIONS = [
  { value: "trust", label: "Trust account" },
  { value: "deposit_holding", label: "Deposit holding account" },
  { value: "business", label: "Business account" },
  { value: "ppra_trust", label: "PPRA trust account" },
]

const ACCOUNT_TYPE_OPTIONS = [
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
]

interface OrgCompliance {
  management_scope: string | null
  property_types: string[]
  ppra_status: string | null
  ppra_ffc_number: string | null
  has_deposit_account: boolean | null
  has_trust_account: boolean | null
}

interface BankAccount {
  id: string
  type: string
  bank_name: string
  account_holder: string
  account_number: string
  branch_code: string
  account_type: string
}

interface AccountFormState {
  type: string
  bank_name: string
  account_holder: string
  account_number: string
  branch_code: string
  account_type: string
}

const EMPTY_ACCOUNT: AccountFormState = {
  type: "trust",
  bank_name: "",
  account_holder: "",
  account_number: "",
  branch_code: "",
  account_type: "cheque",
}

function maskAccount(n: string): string {
  if (n.length <= 4) return n
  return "•".repeat(n.length - 4) + n.slice(-4)
}

function RoleSection({
  value,
  onChange,
  saving,
  onSave,
}: Readonly<{
  value: string
  onChange: (v: string) => void
  saving: boolean
  onSave: () => void
}>) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">Your Role</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={value || ""} onValueChange={(v) => onChange(v ?? "")}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Select role">
              {SCOPE_OPTIONS.find((o) => o.value === value)?.label ?? "Select role"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

function PropertyTypesSection({
  selected,
  onChange,
  saving,
  onSave,
}: Readonly<{
  selected: string[]
  onChange: (v: string[]) => void
  saving: boolean
  onSave: () => void
}>) {
  function toggle(val: string) {
    if (selected.includes(val)) {
      onChange(selected.filter((x) => x !== val))
    } else {
      onChange([...selected, val])
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">Property Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {PROPERTY_TYPE_OPTIONS.map((opt) => {
            const active = selected.includes(opt.value)
            return (
              <Button
                key={opt.value}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => toggle(opt.value)}
                type="button"
              >
                {active && <Check className="size-3.5 mr-1.5" />}
                {opt.label}
              </Button>
            )
          })}
        </div>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

function PPRASection({
  status,
  ffcNumber,
  onStatusChange,
  onFfcChange,
  saving,
  onSave,
}: Readonly<{
  status: string
  ffcNumber: string
  onStatusChange: (v: string) => void
  onFfcChange: (v: string) => void
  saving: boolean
  onSave: () => void
}>) {
  const showFfc = status === "registered" || status === "pending"

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-lg">PPRA Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={status || ""} onValueChange={(v) => onStatusChange(v ?? "")}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Select status">
              {PPRA_OPTIONS.find((o) => o.value === status)?.label ?? "Select status"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PPRA_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showFfc && (
          <div className="space-y-1 max-w-sm">
            <Label className="text-xs">FFC number</Label>
            <Input
              value={ffcNumber}
              onChange={(e) => onFfcChange(e.target.value)}
              placeholder="e.g. FFC-2024-12345"
              className="h-8 text-sm"
            />
          </div>
        )}
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  )
}

function AddAccountForm({
  isPractitioner,
  orgId,
  onSaved,
}: Readonly<{
  isPractitioner: boolean
  orgId: string
  onSaved: (acct: BankAccount) => void
}>) {
  const defaultType = isPractitioner ? "trust" : "deposit_holding"
  const [form, setForm] = useState<AccountFormState>({ ...EMPTY_ACCOUNT, type: defaultType })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof AccountFormState, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  const filteredTypes = isPractitioner
    ? BANK_TYPE_OPTIONS.filter((t) => t.value === "trust" || t.value === "ppra_trust")
    : BANK_TYPE_OPTIONS.filter((t) => t.value === "deposit_holding" || t.value === "business")

  async function handleSave() {
    if (!form.bank_name || !form.account_holder || !form.account_number || !form.branch_code) {
      setError("Please fill in all required fields.")
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data, error: dbErr } = await supabase
      .from("bank_accounts")
      .insert({ ...form, org_id: orgId })
      .select()
      .single()
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    onSaved(data as BankAccount)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Account type</Label>
          <Select value={form.type} onValueChange={(v) => set("type", v ?? "")}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>{filteredTypes.find((o) => o.value === form.type)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {filteredTypes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bank name</Label>
          <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account holder</Label>
          <Input value={form.account_holder} onChange={(e) => set("account_holder", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account number</Label>
          <Input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Branch code</Label>
          <Input value={form.branch_code} onChange={(e) => set("branch_code", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Account category</Label>
          <Select value={form.account_type} onValueChange={(v) => set("account_type", v ?? "")}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>{ACCOUNT_TYPE_OPTIONS.find((o) => o.value === form.account_type)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && <p className="text-xs text-danger mb-1">{error}</p>}
      <DialogFooter>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          Save account
        </Button>
        <DialogClose render={<Button variant="destructive" size="sm" />}>
          Cancel
        </DialogClose>
      </DialogFooter>
    </div>
  )
}

function AccountSection({
  isPractitioner,
  existing,
  orgId,
  onSaved,
}: Readonly<{
  isPractitioner: boolean
  existing: BankAccount[]
  orgId: string
  onSaved: (acct: BankAccount) => void
}>) {
  const [open, setOpen] = useState(false)

  function handleSaved(acct: BankAccount) {
    onSaved(acct)
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div className="space-y-2">
          {existing.map((acct) => (
            <div key={acct.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
              <Check className="size-4 text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{acct.bank_name}</p>
                <p className="text-xs text-muted-foreground">
                  {acct.account_holder} · <span className="font-mono">{maskAccount(acct.account_number)}</span>
                  {" · "}<span className="capitalize">{acct.type.replaceAll("_", " ")}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {existing.length === 0 ? "Add account" : "Add another account"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bank account</DialogTitle>
          </DialogHeader>
          <AddAccountForm
            isPractitioner={isPractitioner}
            orgId={orgId}
            onSaved={handleSaved}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function CompliancePage() {
  const { orgId } = useOrg()
  const [org, setOrg] = useState<OrgCompliance | null>(null)
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [scope, setScope] = useState("")
  const [propertyTypes, setPropertyTypes] = useState<string[]>([])
  const [ppraStatus, setPpraStatus] = useState("")
  const [ppraFfc, setPpraFfc] = useState("")
  const [savingScope, setSavingScope] = useState(false)
  const [savingTypes, setSavingTypes] = useState(false)
  const [savingPpra, setSavingPpra] = useState(false)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("organisations")
      .select("management_scope, property_types, ppra_status, ppra_ffc_number, has_deposit_account, has_trust_account")
      .eq("id", orgId)
      .single()
      .then(({ data, error }) => {
        if (error) { console.error("compliance fetch:", error.message); return }
        const d = data as OrgCompliance
        setOrg(d)
        setScope(d.management_scope ?? "")
        setPropertyTypes(d.property_types ?? [])
        setPpraStatus(d.ppra_status ?? "")
        setPpraFfc(d.ppra_ffc_number ?? "")
      })
    supabase
      .from("bank_accounts")
      .select("id, type, bank_name, account_holder, account_number, branch_code, account_type")
      .eq("org_id", orgId)
      .then(({ data, error }) => {
        if (error) { console.error("bank_accounts fetch:", error.message); return }
        setAccounts((data ?? []) as BankAccount[])
      })
  }, [orgId])

  async function saveScope() {
    if (!orgId) return
    setSavingScope(true)
    const supabase = createClient()
    await supabase.from("organisations").update({ management_scope: scope }).eq("id", orgId)
    setSavingScope(false)
  }

  async function saveTypes() {
    if (!orgId) return
    setSavingTypes(true)
    const supabase = createClient()
    await supabase.from("organisations").update({ property_types: propertyTypes }).eq("id", orgId)
    setSavingTypes(false)
  }

  async function savePpra() {
    if (!orgId) return
    setSavingPpra(true)
    const supabase = createClient()
    const update: Record<string, string | null> = { ppra_status: ppraStatus }
    if (ppraStatus === "registered" || ppraStatus === "pending") {
      update.ppra_ffc_number = ppraFfc || null
    }
    await supabase.from("organisations").update(update).eq("id", orgId)
    setSavingPpra(false)
  }

  if (!org || !orgId) return null

  const isPractitioner = scope === "own_and_others" || scope === "others_only"
  const hasAccount = accounts.length > 0

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Compliance</h1>

      <RoleSection
        value={scope}
        onChange={setScope}
        saving={savingScope}
        onSave={saveScope}
      />

      <PropertyTypesSection
        selected={propertyTypes}
        onChange={setPropertyTypes}
        saving={savingTypes}
        onSave={saveTypes}
      />

      {isPractitioner && (
        <PPRASection
          status={ppraStatus}
          ffcNumber={ppraFfc}
          onStatusChange={setPpraStatus}
          onFfcChange={setPpraFfc}
          saving={savingPpra}
          onSave={savePpra}
        />
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg">
            {isPractitioner ? "Trust Account" : "Deposit Account"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAccount && (
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm text-muted-foreground">Not configured — some features restricted</span>
            </div>
          )}
          <AccountSection
            isPractitioner={isPractitioner}
            existing={accounts}
            orgId={orgId}
            onSaved={(acct) => setAccounts((prev) => [...prev, acct])}
          />
        </CardContent>
      </Card>
    </div>
  )
}
