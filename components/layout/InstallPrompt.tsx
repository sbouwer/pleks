"use client"

/**
 * components/layout/InstallPrompt.tsx — PWA install banner for mobile devices
 *
 * Notes:  Only activates on touch devices with a viewport < 1024px.
 *         Dismissal persists to localStorage (not sessionStorage) so it
 *         doesn't reappear after every browser session.
 */
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISSED_KEY = "pwa_install_dismissed"

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show on mobile — desktop Chrome also fires beforeinstallprompt
    if (window.innerWidth >= 1024 || navigator.maxTouchPoints === 0) return
    // Persist dismissal across sessions
    if (localStorage.getItem(DISMISSED_KEY)) return

    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted" || outcome === "dismissed") {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="lg:hidden fixed bottom-20 left-4 right-4 z-40 bg-card border border-border rounded-xl p-4 shadow-lg">
      <p className="text-sm font-medium mb-0.5">Add Pleks to your home screen</p>
      <p className="text-xs text-muted-foreground mb-3">
        Quick access + offline inspections when you&apos;re in the field.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleInstall} className="flex-1">Add to home screen</Button>
        <Button size="sm" variant="outline" onClick={handleDismiss}>Later</Button>
      </div>
    </div>
  )
}
