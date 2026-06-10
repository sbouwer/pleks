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
import { Field, UnderlineInput, UnderlineSelect } from "@/components/ui/door-form"
import { ActionButton, AddInline, EditButton, DeleteButton, Modal } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"
import { useStepUpSubmit, type StepUpSubmit } from "@/components/auth/useStepUpSubmit"

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

const ACCOUNT_TYPE_SELECT = [
  { value: "", label: "Type…" },
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
]

const maskAccount = (n: string | null) => (n ? `••••${n.slice(-4)}` : "—")

function AccountForm({
  baseUrl, contactId, account, firstAccount, onDone, submit,
}: Readonly<{ baseUrl: string; contactId: string; account: BankAccount | null; firstAccount?: boolean; onDone: () => void; submit: StepUpSubmit }>) {
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
      await submit(
        (stepUpToken) => fetch(baseUrl, {
          method: account ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "bank_account", contactId, ...(account ? { id: account.id } : {}), ...form, ...(stepUpToken ? { stepUpToken } : {}) }),
        }),
        () => { toast.success("Bank account saved"); onDone() },
      )
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Bank"><UnderlineInput value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. FNB" /></Field>
        <Field label="Label (optional)"><UnderlineInput value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Municipal account" /></Field>
        <Field label="Account name" span><UnderlineInput value={form.account_name} onChange={(e) => set("account_name", e.target.value)} /></Field>
        <Field label="Account number"><UnderlineInput value={form.account_number} onChange={(e) => set("account_number", e.target.value)} /></Field>
        <Field label="Branch code"><UnderlineInput value={form.branch_code} onChange={(e) => set("branch_code", e.target.value)} /></Field>
        <Field label="Account type"><UnderlineSelect value={form.account_type} onChange={(v) => set("account_type", v)} options={ACCOUNT_TYPE_SELECT} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.is_primary} disabled={!!firstAccount} onChange={(e) => set("is_primary", e.target.checked)} className="accent-primary" />
          Primary account
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <ActionButton tone="primary" size="sm" onClick={save} disabled={isPending}>{isPending ? "Saving…" : "Save"}</ActionButton>
        <ActionButton tone="secondary" size="sm" onClick={onDone} disabled={isPending}>Cancel</ActionButton>
      </div>
    </div>
  )
}

function AccountRow({
  baseUrl, contactId, account, onEdit, onChanged, submit,
}: Readonly<{ baseUrl: string; contactId: string; account: BankAccount; onEdit: () => void; onChanged: () => void; submit: StepUpSubmit }>) {
  const [isPending, startTransition] = useTransition()

  function mutate(method: "PATCH" | "DELETE", extra: Record<string, unknown>, okMsg: string) {
    startTransition(async () => {
      await submit(
        (stepUpToken) => fetch(baseUrl, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "bank_account", contactId, id: account.id, ...extra, ...(stepUpToken ? { stepUpToken } : {}) }),
        }),
        () => { toast.success(okMsg); onChanged() },
      )
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
          <EditButton label="Edit account" onClick={onEdit} />
          <DeleteButton
            label="Remove account"
            itemName="this bank account"
            description="The bank account will be removed from this contact. This can't be undone."
            confirmLabel="Remove"
            loading={isPending}
            onConfirm={() => mutate("DELETE", {}, "Bank account removed")}
          />
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
  const { submit, stepUpModal } = useStepUpSubmit("change banking details")  // bank changes require fresh re-auth (Finding 1)

  const editing = editingId ? accounts.find((a) => a.id === editingId) ?? null : null
  const formOpen = adding || editingId !== null
  const closeForm = () => { setAdding(false); setEditingId(null) }

  return (
    <DetailCard title="Banking">
      {accounts.length === 0 ? (
        <AddInline label="Add bank account" onClick={() => setAdding(true)} />
      ) : (
        <>
          <div className="space-y-2">
            {accounts.map((acc) => (
              <AccountRow key={acc.id} baseUrl={baseUrl} contactId={contactId} account={acc} onEdit={() => setEditingId(acc.id)} onChanged={refresh} submit={submit} />
            ))}
          </div>
          <div className="mt-2">
            <AddInline label="Add another account" onClick={() => setAdding(true)} />
          </div>
        </>
      )}

      {/* Add / edit happens in a popup modal, not inline (no card-in-card). */}
      <Modal open={formOpen} onClose={closeForm} title={editing ? "Edit bank account" : "Add bank account"}>
        <AccountForm
          key={editingId ?? "new"}
          baseUrl={baseUrl}
          contactId={contactId}
          account={editing}
          firstAccount={accounts.length === 0}
          onDone={() => { closeForm(); refresh() }}
          submit={submit}
        />
      </Modal>

      {stepUpModal}
    </DetailCard>
  )
}
