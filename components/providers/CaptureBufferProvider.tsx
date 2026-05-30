"use client"

/**
 * components/providers/CaptureBufferProvider.tsx — Mounts the bug-report capture buffer
 *
 * Notes:  Initialises lib/feedback/capture-buffer once, app-wide, so recent console
 *         errors + failed requests are already in hand when a user files a bug report
 *         (ADDENDUM_68 Slice 1). Effect cleanup restores the patched console/fetch.
 */

import { useEffect } from "react"
import { initCaptureBuffer } from "@/lib/feedback/capture-buffer"

export function CaptureBufferProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  useEffect(() => initCaptureBuffer(), [])
  return <>{children}</>
}
