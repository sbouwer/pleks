"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { updateMaintenanceStatus } from "@/lib/actions/maintenance"
import { useOrg } from "@/hooks/useOrg"
import { createClient } from "@/lib/supabase/client"

// Web Speech API — not in default TS lib, defined locally
interface SpeechRecognitionResult {
  readonly 0: { transcript: string }
  readonly length: number
}
interface SpeechRecognitionResultList {
  readonly 0: SpeechRecognitionResult
  readonly length: number
}
interface SpeechRecognitionEvent {
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface TimelineItem {
  label: string
  date: string
}

interface PersistedNote {
  id: string
  note: string
  createdAt: string
}

interface Props {
  requestId: string
  title: string
  description: string
  status: string
  urgency: string | null
  category: string | null
  workOrderNumber: string | null
  unitLabel: string
  tenantName: string | null
  tenantPhone: string | null
  contractorName: string | null
  contractorPhone: string | null
  aiTriageNotes: string | null
  photoCount: number
  timeline: TimelineItem[]
  /** Notes persisted in audit_log from previous sessions */
  persistedNotes?: PersistedNote[]
}

interface Contractor {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  trade: string | null
}

interface LocalNote {
  id: string
  text: string
  createdAt: string
}

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears" | "scheduled"> = {
  pending_review: "pending",
  approved: "scheduled",
  work_order_sent: "scheduled",
  acknowledged: "scheduled",
  in_progress: "active",
  pending_completion: "pending",
  completed: "completed",
  closed: "completed",
  rejected: "arrears",
  cancelled: "arrears",
}

const URGENCY_COLORS: Record<string, string> = {
  emergency: "bg-red-100 text-red-700",
  urgent: "bg-orange-100 text-orange-700",
  routine: "bg-muted text-muted-foreground",
  cosmetic: "bg-muted text-muted-foreground",
}

export function MobileMaintenanceView({
  requestId,
  title,
  description,
  status,
  urgency,
  category,
  workOrderNumber,
  unitLabel,
  tenantName,
  tenantPhone,
  contractorName: initialContractorName,
  contractorPhone: initialContractorPhone,
  aiTriageNotes,
  photoCount: initialPhotoCount,
  timeline,
  persistedNotes = [],
}: Readonly<Props>) {
  const router = useRouter()
  const { orgId } = useOrg()

  const [photoCount, setPhotoCount] = useState(initialPhotoCount)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [submittingNote, setSubmittingNote] = useState(false)
  const [localNotes, setLocalNotes] = useState<LocalNote[]>([])
  const [assignSheetOpen, setAssignSheetOpen] = useState(false)
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loadingContractors, setLoadingContractors] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [contractorName, setContractorName] = useState(initialContractorName)
  const [contractorPhone, setContractorPhone] = useState(initialContractorPhone)
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/maintenance/${requestId}/photo`, {
        method: "POST",
        body: fd,
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Upload failed")
      }
      setPhotoCount((c) => c + 1)
      toast.success("Photo added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }, [requestId])

  const handleSubmitNote = useCallback(async () => {
    const trimmed = noteText.trim()
    if (!trimmed) return
    setSubmittingNote(true)
    try {
      const res = await fetch(`/api/maintenance/${requestId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Failed to save note")
      }
      setLocalNotes((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: trimmed, createdAt: new Date().toISOString() },
      ])
      setNoteText("")
      setShowNoteInput(false)
      toast.success("Note saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note")
    } finally {
      setSubmittingNote(false)
    }
  }, [noteText, requestId])

  const handleVoiceNote = useCallback(() => {
    type SpeechWindow = typeof globalThis & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
    const w = globalThis.window === undefined ? null : (globalThis as SpeechWindow)
    const SpeechRec: SpeechRecognitionConstructor | undefined = w?.SpeechRecognition ?? w?.webkitSpeechRecognition

    if (!SpeechRec) {
      setVoiceSupported(false)
      setShowNoteInput(true)
      return
    }

    if (voiceActive && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recognition = new SpeechRec()
    recognition.lang = "en-ZA"
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      setNoteText(`[Voice note] ${transcript}`)
      setShowNoteInput(true)
    }

    recognition.onerror = () => {
      setVoiceActive(false)
      toast.error("Voice recognition failed")
    }

    recognition.onend = () => {
      setVoiceActive(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setVoiceActive(true)
  }, [voiceActive])

  const handleOpenAssignSheet = useCallback(async () => {
    setAssignSheetOpen(true)
    if (contractors.length > 0) return
    if (!orgId) return
    setLoadingContractors(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("contractors")
        .select("id, first_name, last_name, company_name, phone, trade")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("company_name")
      if (error) throw error
      setContractors((data as Contractor[]) ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load contractors")
    } finally {
      setLoadingContractors(false)
    }
  }, [contractors.length, orgId])

  const handleAssign = useCallback(async (contractor: Contractor) => {
    setAssigningId(contractor.id)
    try {
      const res = await fetch(`/api/maintenance/${requestId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: contractor.id }),
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Assign failed")
      }
      const name = contractor.company_name || `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim()
      setContractorName(name)
      setContractorPhone(contractor.phone ?? null)
      setAssignSheetOpen(false)
      toast.success(`Assigned to ${name}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed")
    } finally {
      setAssigningId(null)
    }
  }, [requestId, router])

  const handleStatus = useCallback(async (newStatus: string) => {
    const result = await updateMaintenanceStatus(requestId, newStatus)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Status updated")
      router.refresh()
    }
  }, [requestId, router])

  const badgeStatus = STATUS_MAP[status] ?? "pending"

  return (
    <div className="px-4 pb-8 space-y-6">
      {/* Back nav */}
      <div className="pt-4">
        <Link href="/maintenance" className="text-sm text-muted-foreground hover:text-foreground">
          ← Maintenance
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{unitLabel}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {urgency && (
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", URGENCY_COLORS[urgency] ?? URGENCY_COLORS.routine)}>
              {urgency}
            </span>
          )}
          <StatusBadge status={badgeStatus} />
          {workOrderNumber && (
            <span className="text-xs text-muted-foreground">{workOrderNumber}</span>
          )}
        </div>
        {category && <p className="text-xs text-muted-foreground mt-1">{category}</p>}
        {aiTriageNotes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{aiTriageNotes}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <p className="text-sm whitespace-pre-wrap">{description}</p>
      </div>

      {/* Tenant */}
      <div className="border rounded-lg p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tenant</p>
        {tenantName ? (
          <>
            <p className="text-sm font-medium">{tenantName}</p>
            {tenantPhone && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{tenantPhone}</p>
                <a href={`tel:${tenantPhone}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">📞 Call</Button>
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No tenant linked</p>
        )}
      </div>

      {/* Contractor */}
      <div className="border rounded-lg p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contractor</p>
        {contractorName ? (
          <>
            <p className="text-sm font-medium">{contractorName}</p>
            {contractorPhone && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{contractorPhone}</p>
                <a href={`tel:${contractorPhone}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs">📞 Call</Button>
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not assigned</p>
        )}
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={handleOpenAssignSheet}>
          Assign contractor
        </Button>
      </div>

      {/* Photos */}
      <div className="border rounded-lg p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Photos</p>
          <span className="text-sm text-muted-foreground">{photoCount} photo{photoCount === 1 ? "" : "s"}</span>
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          ref={photoInputRef}
          onChange={handlePhotoCapture}
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          disabled={uploadingPhoto}
          onClick={() => photoInputRef.current?.click()}
        >
          {uploadingPhoto ? "Uploading…" : "📷 Add photo"}
        </Button>
      </div>

      {/* Notes */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>

        {persistedNotes.map((note) => (
          <div key={note.id} className="text-sm bg-muted/50 rounded p-2">
            <p>{note.note}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(note.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}

        {localNotes.map((note) => (
          <div key={note.id} className="text-sm bg-muted/50 rounded p-2">
            <p>{note.text}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(note.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}

        {showNoteInput && (
          <div className="space-y-2">
            <textarea
              className="w-full text-sm border rounded p-2 min-h-[80px] bg-background resize-none"
              placeholder="Write your note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmitNote} disabled={submittingNote || !noteText.trim()}>
                {submittingNote ? "Saving…" : "Save note"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowNoteInput(false); setNoteText("") }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!showNoteInput && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowNoteInput(true)}>
              Add note
            </Button>
            {voiceSupported && (
              <Button
                size="sm"
                variant={voiceActive ? "default" : "outline"}
                className="flex-1"
                onClick={handleVoiceNote}
              >
                {voiceActive ? "⏹ Stop" : "🎙 Voice note"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Activity timeline */}
      {timeline.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</p>
          {timeline.map((item) => (
            <div key={`${item.label}-${item.date}`} className="flex items-start gap-2 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status actions */}
      <div className="border rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update status</p>
        <div className="flex flex-wrap gap-2">
          {status === "pending_review" && (
            <>
              <Button size="sm" onClick={() => handleStatus("approved")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => handleStatus("rejected")}>Reject</Button>
            </>
          )}
          {status === "approved" && (
            <Button size="sm" onClick={() => handleStatus("work_order_sent")}>Send Work Order</Button>
          )}
          {status === "in_progress" && (
            <Button size="sm" onClick={() => handleStatus("pending_completion")}>Mark pending completion</Button>
          )}
          {status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => handleStatus("closed")}>Close</Button>
          )}
          {!["completed", "closed", "cancelled", "rejected"].includes(status) && (
            <Button size="sm" variant="outline" onClick={() => handleStatus("cancelled")}>Cancel</Button>
          )}
        </div>
      </div>

      {/* Assign contractor sheet */}
      <Sheet open={assignSheetOpen} onOpenChange={setAssignSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Assign Contractor</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {loadingContractors && (
              <p className="text-sm text-muted-foreground text-center py-4">Loading contractors…</p>
            )}
            {!loadingContractors && contractors.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No contractors found.</p>
            )}
            {contractors.map((c) => {
              const name = c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()
              return (
                <button
                  key={c.id}
                  className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors disabled:opacity-50"
                  disabled={assigningId === c.id}
                  onClick={() => handleAssign(c)}
                >
                  <p className="font-medium text-sm">{name}</p>
                  {c.trade && <p className="text-xs text-muted-foreground">{c.trade}</p>}
                  {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  {assigningId === c.id && (
                    <p className="text-xs text-muted-foreground mt-1">Assigning…</p>
                  )}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
