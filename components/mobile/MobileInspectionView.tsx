"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { updateItemCondition, updateInspectionStatus } from "@/lib/actions/inspections"

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
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export interface InspectionItem {
  id: string
  item_name: string
  condition: string | null
  condition_notes: string | null
}

export interface InspectionRoom {
  id: string
  room_label: string
  room_type: string
  display_order: number
  items: InspectionItem[]
}

interface Props {
  inspectionId: string
  inspectionType: string
  status: string
  leaseType: string
  scheduledDate: string | null
  unitLabel: string
  tenantName: string | null
  rooms: InspectionRoom[]
}

const STATUS_MAP: Record<string, "scheduled" | "pending" | "active" | "completed" | "arrears"> = {
  scheduled: "scheduled",
  in_progress: "pending",
  completed: "completed",
  awaiting_tenant_review: "pending",
  disputed: "arrears",
  dispute_resolved: "completed",
  finalised: "completed",
}

const CONDITION_TO_STARS: Record<string, number> = {
  excellent: 5,
  good: 4,
  fair: 3,
  poor: 2,
  damaged: 1,
  missing: 1,
  not_inspected: 0,
}

const STARS_TO_CONDITION: Record<number, string> = {
  5: "excellent",
  4: "good",
  3: "fair",
  2: "poor",
  1: "damaged",
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn("text-2xl leading-none", n <= value ? "text-yellow-400" : "text-muted-foreground/30")}
        >
          ★
        </button>
      ))}
    </div>
  )
}

interface ItemRowProps {
  item: InspectionItem
  inspectionId: string
  roomId: string
  onUpdate: (itemId: string, condition: string, notes: string | null) => void
}

function ItemRow({ item, inspectionId, roomId, onUpdate }: ItemRowProps) {
  const [noteValue, setNoteValue] = useState(item.condition_notes ?? "")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const stars = CONDITION_TO_STARS[item.condition ?? "not_inspected"] ?? 0

  const handleStarChange = useCallback(async (v: number) => {
    const condition = STARS_TO_CONDITION[v] ?? "not_inspected"
    setSaving(true)
    try {
      const result = await updateItemCondition(item.id, inspectionId, condition, noteValue || undefined)
      if (result?.error) {
        toast.error(result.error)
      } else {
        onUpdate(item.id, condition, noteValue || null)
      }
    } finally {
      setSaving(false)
    }
  }, [item.id, inspectionId, noteValue, onUpdate])

  const handleNoteBlur = useCallback(async () => {
    if (item.condition && item.condition !== "not_inspected") {
      setSaving(true)
      try {
        const result = await updateItemCondition(item.id, inspectionId, item.condition, noteValue || undefined)
        if (result?.error) {
          toast.error(result.error)
        } else {
          onUpdate(item.id, item.condition, noteValue || null)
        }
      } finally {
        setSaving(false)
      }
    }
  }, [item.id, item.condition, inspectionId, noteValue, onUpdate])

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("itemId", item.id)
      fd.append("roomId", roomId)
      const res = await fetch(`/api/inspection/${inspectionId}/photo`, {
        method: "POST",
        body: fd,
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Upload failed")
      }
      toast.success("Photo added")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (photoRef.current) photoRef.current.value = ""
    }
  }, [item.id, roomId, inspectionId])

  return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{item.item_name}</p>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>

      <StarRating value={stars} onChange={handleStarChange} />

      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 text-xs border rounded px-2 py-1 bg-background"
          placeholder="Add note"
          value={noteValue}
          onChange={(e) => setNoteValue(e.target.value)}
          onBlur={handleNoteBlur}
        />
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          ref={photoRef}
          onChange={handlePhotoCapture}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0"
          disabled={uploading}
          onClick={() => photoRef.current?.click()}
        >
          {uploading ? "…" : "📷"}
        </Button>
      </div>
    </div>
  )
}

export function MobileInspectionView({
  inspectionId,
  inspectionType,
  status,
  leaseType,
  scheduledDate,
  unitLabel,
  tenantName,
  rooms,
}: Props) {
  const router = useRouter()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [roomItems, setRoomItems] = useState<Record<string, InspectionItem[]>>(() =>
    Object.fromEntries(rooms.map((r) => [r.id, r.items]))
  )
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [voiceActive, setVoiceActive] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const totalItems = rooms.reduce((sum, r) => sum + (roomItems[r.id]?.length ?? 0), 0)
  const inspectedItems = rooms.reduce((sum, r) => {
    const items = roomItems[r.id] ?? []
    return sum + items.filter((i) => i.condition && i.condition !== "not_inspected").length
  }, 0)

  const handleItemUpdate = useCallback((roomId: string) => (itemId: string, condition: string, notes: string | null) => {
    setRoomItems((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? []).map((i) =>
        i.id === itemId ? { ...i, condition, condition_notes: notes } : i
      ),
    }))
  }, [])

  const handleStatusAction = useCallback(async (newStatus: string) => {
    setUpdatingStatus(true)
    try {
      const result = await updateInspectionStatus(inspectionId, newStatus)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success("Status updated")
        router.refresh()
      }
    } finally {
      setUpdatingStatus(false)
    }
  }, [inspectionId, router])

  const handleVoiceSummary = useCallback(() => {
    type SpeechWindow = typeof globalThis & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }
    const w = globalThis.window === undefined ? null : (globalThis as SpeechWindow)
    const SpeechRec: SpeechRecognitionConstructor | undefined = w?.SpeechRecognition ?? w?.webkitSpeechRecognition

    if (!SpeechRec) {
      toast.error("Voice recognition not supported on this device")
      return
    }

    if (voiceActive && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recognition = new SpeechRec()
    recognition.lang = "en-ZA"
    recognition.interimResults = false

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ""
      toast.success(`Voice summary: ${transcript}`, { duration: 6000 })
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

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId)

  // Room detail view
  if (selectedRoom) {
    const items = roomItems[selectedRoom.id] ?? []
    const roomInspected = items.filter((i) => i.condition && i.condition !== "not_inspected").length
    const onUpdate = handleItemUpdate(selectedRoom.id)

    return (
      <div className="px-4 pb-8 space-y-4">
        <div className="pt-4">
          <button
            type="button"
            onClick={() => setSelectedRoomId(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← {selectedRoom.room_label}
          </button>
        </div>

        <div>
          <h2 className="text-lg font-bold">{selectedRoom.room_label}</h2>
          <p className="text-xs text-muted-foreground">{roomInspected}/{items.length} items inspected</p>
        </div>

        <div>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              inspectionId={inspectionId}
              roomId={selectedRoom.id}
              onUpdate={onUpdate}
            />
          ))}
        </div>

        {roomInspected === items.length && items.length > 0 && (
          <p className="text-sm text-center text-success font-medium">✅ All items inspected</p>
        )}

        <Button
          className="w-full"
          variant="outline"
          onClick={() => setSelectedRoomId(null)}
        >
          ← Back to rooms
        </Button>
      </div>
    )
  }

  // Room list view
  return (
    <div className="px-4 pb-8 space-y-6">
      {/* Back nav */}
      <div className="pt-4">
        <Link href="/inspections" className="text-sm text-muted-foreground hover:text-foreground">
          ← Inspections
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold capitalize leading-tight">
          {inspectionType.replaceAll("_", " ")}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{unitLabel}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <StatusBadge status={STATUS_MAP[status] ?? "scheduled"} />
          <span className="text-xs text-muted-foreground capitalize">{leaseType}</span>
          {tenantName && (
            <span className="text-xs text-muted-foreground">· {tenantName}</span>
          )}
          {scheduledDate && (
            <span className="text-xs text-muted-foreground">
              · {new Date(scheduledDate).toLocaleDateString("en-ZA")}
            </span>
          )}
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-muted-foreground">Progress</span>
          <span className="text-sm font-medium">{inspectedItems}/{totalItems} items</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-brand rounded-full transition-all"
            style={{ width: totalItems > 0 ? `${(inspectedItems / totalItems) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Rooms */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rooms</p>
        {rooms.map((room) => {
          const items = roomItems[room.id] ?? []
          const done = items.filter((i) => i.condition && i.condition !== "not_inspected").length
          const isComplete = items.length > 0 && done === items.length
          const isEmpty = done === 0

          return (
            <button
              key={room.id}
              type="button"
              className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors flex items-center justify-between"
              onClick={() => setSelectedRoomId(room.id)}
            >
              <div>
                <p className="font-medium text-sm">{room.room_label}</p>
                <p className="text-xs text-muted-foreground">{done}/{items.length} items</p>
              </div>
              <span className="text-lg">
                {isComplete && "✅"}
                {!isComplete && isEmpty && "⏳"}
                {!isComplete && !isEmpty && "🔄"}
              </span>
            </button>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick actions</p>
        <Button
          size="sm"
          variant={voiceActive ? "default" : "outline"}
          className="w-full"
          onClick={handleVoiceSummary}
        >
          {voiceActive ? "⏹ Stop recording" : "🎙 Voice summary"}
        </Button>

        {status === "scheduled" && (
          <Button
            size="sm"
            className="w-full"
            disabled={updatingStatus}
            onClick={() => handleStatusAction("in_progress")}
          >
            {updatingStatus ? "Starting…" : "▶ Start inspection"}
          </Button>
        )}
        {status === "in_progress" && (
          <Button
            size="sm"
            className="w-full"
            disabled={updatingStatus}
            onClick={() => handleStatusAction("completed")}
          >
            {updatingStatus ? "Completing…" : "✅ Complete inspection"}
          </Button>
        )}
      </div>
    </div>
  )
}
