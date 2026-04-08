"use client"

/**
 * Unsubscribe client component.
 * Category toggles with mandatory categories greyed-out.
 * Calls PATCH /api/unsubscribe to persist changes.
 */

import { useState } from "react"

interface Prefs {
  unsubscribed_at: string | null
  email_applications: boolean
  email_maintenance: boolean
  email_arrears: boolean
  email_inspections: boolean
  email_lease: boolean
  email_statements: boolean
  sms_maintenance: boolean
  sms_arrears: boolean
  sms_inspections: boolean
}

interface Props {
  token: string
  orgName: string
  prefs: Prefs
}

interface CategoryRow {
  label: string
  emailCol?: keyof Prefs
  smsCol?: keyof Prefs
  mandatory?: boolean
  mandatoryReason?: string
}

const CATEGORIES: CategoryRow[] = [
  {
    label: "Applications",
    emailCol: "email_applications",
  },
  {
    label: "Maintenance",
    emailCol: "email_maintenance",
    smsCol: "sms_maintenance",
  },
  {
    label: "Arrears & Payments",
    emailCol: "email_arrears",
    smsCol: "sms_arrears",
  },
  {
    label: "Inspections",
    emailCol: "email_inspections",
    smsCol: "sms_inspections",
  },
  {
    label: "Lease & Tenancy",
    emailCol: "email_lease",
  },
  {
    label: "Statements",
    emailCol: "email_statements",
  },
  {
    label: "Legal Notices",
    mandatory: true,
    mandatoryReason: "Required by law",
  },
]

export function UnsubscribeClient({ token, orgName, prefs: initialPrefs }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsubscribedAll, setUnsubscribedAll] = useState(!!initialPrefs.unsubscribed_at)

  function toggle(col: keyof Prefs) {
    setPrefs((p) => ({ ...p, [col]: !p[col] }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prefs, unsubscribed_at: unsubscribedAll ? new Date().toISOString() : null }),
      })
      if (!res.ok) throw new Error("Failed to save preferences")
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  async function handleUnsubscribeAll() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error("Failed to unsubscribe")
      setUnsubscribedAll(true)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  async function handleResubscribe() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unsubscribed_at: null }),
      })
      if (!res.ok) throw new Error("Failed to resubscribe")
      setUnsubscribedAll(false)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-lg w-full p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Email Preferences</h1>
        <p className="text-sm text-gray-500 mb-6">
          Manage notifications from <span className="font-medium text-gray-700">{orgName}</span>
        </p>

        {unsubscribedAll ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-6">
            <p className="text-sm font-medium text-amber-800">You are unsubscribed from all non-mandatory emails.</p>
            <p className="text-sm text-amber-700 mt-1">
              Legal notices and mandatory communications will still be delivered as required by law.
            </p>
            <button
              onClick={handleResubscribe}
              disabled={saving}
              className="mt-3 text-sm font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
            >
              Resubscribe to all categories
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 mb-6">
              {CATEGORIES.map((cat) => (
                <div key={cat.label} className="py-3 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${cat.mandatory ? "text-gray-400" : "text-gray-800"}`}>
                      {cat.label}
                    </p>
                    {cat.mandatoryReason && (
                      <p className="text-xs text-gray-400 mt-0.5">{cat.mandatoryReason}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {cat.emailCol && !cat.mandatory && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs[cat.emailCol] as boolean}
                          onChange={() => toggle(cat.emailCol!)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-500">Email</span>
                      </label>
                    )}
                    {cat.smsCol && !cat.mandatory && (
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs[cat.smsCol] as boolean}
                          onChange={() => toggle(cat.smsCol!)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-500">SMS</span>
                      </label>
                    )}
                    {cat.mandatory && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked
                          disabled
                          className="h-4 w-4 rounded border-gray-200 text-gray-300 cursor-not-allowed"
                        />
                        <span className="text-xs text-gray-300">Email</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-4">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : saved ? "Saved" : "Save preferences"}
              </button>

              <button
                onClick={handleUnsubscribeAll}
                disabled={saving}
                className="text-sm text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
              >
                Unsubscribe from all
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-gray-400 mt-8 pt-6 border-t border-gray-100">
          Mandatory communications (legal notices, lease documents required by the Rental Housing Act) cannot be disabled.
        </p>
      </div>
    </div>
  )
}
