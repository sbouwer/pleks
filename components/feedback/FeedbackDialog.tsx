"use client"

/**
 * components/feedback/FeedbackDialog.tsx — Feedback submission modal
 *
 * Auth:   Any authenticated user — POST /api/feedback handles auth check
 * Notes:  Collects category, subject, body, optional star rating.
 *         Role is injected from the parent layout context.
 */

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FeedbackCategory, FeedbackRole } from "@/lib/feedback/queries"

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "bug",     label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "ux",      label: "UX / design" },
  { value: "billing", label: "Billing" },
  { value: "praise",  label: "Something I love" },
  { value: "general", label: "General" },
]

interface FeedbackDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  role:         FeedbackRole
}

export function FeedbackDialog({ open, onOpenChange, role }: Readonly<FeedbackDialogProps>) {
  const [category, setCategory] = useState<FeedbackCategory>("general")
  const [subject,  setSubject]  = useState("")
  const [body,     setBody]     = useState("")
  const [rating,   setRating]   = useState<number | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject: subject.trim(), body: body.trim(), rating, role }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? "Failed to send feedback.")
        return
      }
      setDone(true)
    } catch {
      toast.error("Failed to send feedback. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  function handleClose(value: boolean) {
    if (!value) {
      // Reset on close
      setTimeout(() => {
        setDone(false)
        setSubject("")
        setBody("")
        setRating(null)
        setCategory("general")
      }, 200)
    }
    onOpenChange(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{done ? "Thanks for your feedback!" : "Send feedback"}</DialogTitle>
          {!done && (
            <DialogDescription>
              Let us know what&apos;s working, what&apos;s broken, or what you&apos;d like to see.
            </DialogDescription>
          )}
        </DialogHeader>

        {done ? (
          <div className="py-4 text-sm text-muted-foreground">
            We&apos;ve received your feedback and will review it shortly. You may receive a reply
            by email if we need more information.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fb-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as FeedbackCategory)}
              >
                <SelectTrigger id="fb-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fb-subject">Subject</Label>
              <Input
                id="fb-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Brief summary"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fb-body">Details</Label>
              <Textarea
                id="fb-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                rows={4}
                placeholder="Describe the issue or idea in detail…"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Overall rating (optional)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    className={`text-xl transition-opacity ${
                      rating != null && rating >= n ? "opacity-100" : "opacity-30"
                    }`}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || subject.trim().length < 3 || body.trim().length < 10}
              >
                {saving ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
