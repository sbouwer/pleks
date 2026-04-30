"use client"

/**
 * components/feedback/FeedbackToast.tsx — Feedback notification toast helpers
 *
 * Notes: Thin wrappers over sonner with consistent feedback copy.
 *        Import feedbackToast() — not the component itself.
 */

import { toast } from "sonner"

export function feedbackToast(type: "success" | "error", message?: string) {
  if (type === "success") {
    toast.success(message ?? "Feedback submitted — we'll be in touch.")
  } else {
    toast.error(message ?? "Failed to submit feedback. Please try again.")
  }
}
