"use client"

/**
 * components/contacts/edit/BankAccountsSection.tsx — multi-account banking block (global contact_bank_accounts)
 *
 * Auth:   posts to /api/{entityType}/{entityId}/contact-details (type: bank_account) — gated server-side
 * Data:   contact_bank_accounts via the shared contact-details route; one primary per contact
 * Notes:  account number masked on display (mask-before-display). "+ Add" mirrors the address pattern — a
 *         contact can hold many accounts (utilities keep one per bank for same-bank payment). Used by the
 *         supplier + landlord detail pages; entityType routes to the right contact-details endpoint.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EditButton } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"

export interface BankAccount {
  id: string
  account_name: string | null
  bank_name: string | null
  account_number: string | null
  branch_code: string | null
  account_type: string | null
  label: string | null
  is_primary: boolean
}

type EntityType = "suppliers" | "landlords" | "tenants"

const ACCOUNT_TYPE_OPTIONS = [
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
]

const maskAccount = (n: string | null) => (n ? `••••${n.slice(-4)}` : "—")

function AccountForm({
  baseUrl, contactId, account, firstAccount, onDone,
}: Readonly<{ baseUrl: string; contactId: string; account: BankAccount | null; firstAccount?: boolean; onDone: () => void }>) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    account_name: account?.account_name ?? "",
    bank_name: account?.bank_name ?? "",
    account_number: account?.account_number ?? "",
    branch_code: account?.branch_code ?? "",
    account_type: account?.account_type ?? "",
    label: account?.label ?? "",
    is_primary: account?.is_primary ?? !!firstAccount,
  })
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  function save() {
    startTransition(async () => {
      try {
        const res = await fetch(baseUrl, {
          method: account ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "bank_account", contactId, ...(account ? { id: account.id } : {}), ...form }),
        })
        if (!res.ok) throw new Error()
        toast.success("Bank account saved")
        onDone()
      } catch {
        toast.error("Failed to save bank account")
      }
    })
  }

  return (
    <div className="space-y-2 rounded-[var(--r-button)] border border-border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Bank</Label><Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} className="h-8 text-sm mt-1" placeholder="e.g. FNB" /></div>
        <div><Label className="text-xs">Label (optional)</Label><Input value={form.label} onChange={(e) => set("label", e.target.value)} className="h-8 text-sm mt-1" placeholder="e.g. Municipal account" /></div>
      </div>
      <div><Label className="text-xs">Account name</Label><Input value={form.account_name} onChange={(e) => set("account_name", e.target.value)} className="h-8 text-sm mt-1" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Account number</Label><Input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} className="h-8 text-sm mt-1" /></div>
        <div><Label className="text-xs">Branch code</Label><Input value={form.branch_code} onChange={(e) => set("branch_code", e.target.value)} className="h-8 text-sm mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <div>
          <Label className="text-xs">Account type</Label>
          <Select value={form.account_type} onValueChange={(v) => set("account_type", v ?? "")}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>{ACCOUNT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground pb-1.5">
          <input type="checkbox" checked={form.is_primary} disabled={!!firstAccount} onChange={(e) => set("is_primary", e.target.checked)} />
          Primary account
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={save} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={isPending} className="h-7 text-xs">Cancel</Button>
      </div>
    </div>
  )
}

function AccountRow({
  baseUrl, contactId, account, onEdit, onChanged,
}: Readonly<{ baseUrl: string; contactId: string; account: BankAccount; onEdit: () => void; onChanged: () => void }>) {
  const [isPending, startTransition] = useTransition()

  function mutate(method: "PATCH" | "DELETE", extra: Record<string, unknown>, okMsg: string) {
    startTransition(async () => {
      try {
        const res = await fetch(baseUrl, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "bank_account", contactId, id: account.id, ...extra }),
        })
        if (!res.ok) throw new Error()
        toast.success(okMsg)
        onChanged()
      } catch {
        toast.error("Action failed")
      }
    })
  }

  return (
    <div className="rounded-[var(--r-button)] border border-border/60 p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{account.bank_name || "Bank account"}</span>
            {account.label && <span className="text-xs text-muted-foreground">· {account.label}</span>}
            {account.is_primary && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Primary</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {maskAccount(account.account_number)}
            {account.branch_code && ` · ${account.branch_code}`}
            {account.account_type && ` · ${account.account_type}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!account.is_primary && (
            <button type="button" disabled={isPending} onClick={() => mutate("PATCH", { is_primary: true, account_name: account.account_name, bank_name: account.bank_name, account_number: account.account_number, branch_code: account.branch_code, account_type: account.account_type, label: account.label }, "Primary updated")}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Make primary</button>
          )}
          <EditButton mode="label" label="Edit" onClick={onEdit} />
          <button type="button" disabled={isPending} onClick={() => mutate("DELETE", {}, "Bank account removed")}
            className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">Remove</button>
        </div>
      </div>
    </div>
  )
}

export function BankAccountsSection({
  entityType, entityId, contactId, accounts,
}: Readonly<{ entityType: EntityType; entityId: string; contactId: string; accounts: BankAccount[] }>) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const baseUrl = `/api/${entityType}/${entityId}/contact-details`
  const refresh = () => router.refresh()

  return (
    <DetailCard
      title="Banking"
      headerAction={!adding && editingId === null ? <EditButton mode="label" label="Add" onClick={() => setAdding(true)} /> : undefined}
    >
      {accounts.length === 0 && !adding && <p className="text-xs text-muted-foreground">No bank accounts.</p>}

      <div className="space-y-2">
        {accounts.map((acc) =>
          editingId === acc.id ? (
            <AccountForm key={acc.id} baseUrl={baseUrl} contactId={contactId} account={acc} onDone={() => { setEditingId(null); refresh() }} />
          ) : (
            <AccountRow key={acc.id} baseUrl={baseUrl} contactId={contactId} account={acc} onEdit={() => setEditingId(acc.id)} onChanged={refresh} />
          ),
        )}
        {adding && (
          <AccountForm baseUrl={baseUrl} contactId={contactId} account={null} firstAccount={accounts.length === 0} onDone={() => { setAdding(false); refresh() }} />
        )}
      </div>

      {!adding && editingId === null && accounts.length > 0 && (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Plus className="h-3.5 w-3.5" /> Add another account
        </button>
      )}
    </DetailCard>
  )
}
