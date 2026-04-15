"use client"

import { useState } from "react"
import { X, Plus, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { RoomEntry } from "@/lib/units/roomListGenerator"

interface RoomListProps {
  rooms: RoomEntry[]
  onChange: (rooms: RoomEntry[]) => void
}

export function RoomList({ rooms, onChange }: RoomListProps) {
  const [addInput, setAddInput] = useState("")

  const includedRooms = rooms.filter((r) => r.included)
  const suggestions = rooms.filter((r) => !r.included)

  function updateLabel(id: string, label: string) {
    onChange(rooms.map((r) => (r.id === id ? { ...r, label } : r)))
  }

  function removeRoom(id: string) {
    const room = rooms.find((r) => r.id === id)
    if (!room) return
    if (room.is_custom) {
      // Custom rooms are deleted entirely
      onChange(rooms.filter((r) => r.id !== id))
    } else {
      // Standard rooms move to suggestions
      onChange(rooms.map((r) => (r.id === id ? { ...r, included: false } : r)))
    }
  }

  function addSuggestion(id: string) {
    onChange(rooms.map((r) => (r.id === id ? { ...r, included: true } : r)))
  }

  function addCustomRoom() {
    const val = addInput.trim()
    if (!val) return
    const id = `custom_${Date.now()}`
    onChange([...rooms, { id, room_type: "other", label: val, is_custom: true, included: true }])
    setAddInput("")
  }

  if (includedRooms.length === 0 && suggestions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a unit type above to generate the room list.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Auto-generated from unit type. Edit labels, remove rooms that don&apos;t apply, add custom rooms.
      </p>

      {/* Included rooms */}
      {includedRooms.length > 0 && (
        <div className="space-y-1.5">
          {includedRooms.map((room) => (
            <div key={room.id} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-success shrink-0" />
              <Input
                value={room.label}
                onChange={(e) => updateLabel(room.id, e.target.value)}
                className="h-8 text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => removeRoom(room.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={`Remove ${room.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Add if applicable:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => addSuggestion(room.id)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-dashed border-border hover:border-brand/60 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
                {room.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add custom room */}
      <div className="flex gap-2 max-w-xs">
        <Input
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addCustomRoom()
            }
          }}
          placeholder="Add room... (e.g. Scullery)"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustomRoom}>
          Add
        </Button>
      </div>
    </div>
  )
}
