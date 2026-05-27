"use client"

/**
 * components/legal/ConsentGate.tsx — thin wrapper that mounts ConsentGateModal on demand
 *
 * Notes:  Reads ?pending_consent=1 from the URL. When present, renders ConsentGateModal.
 *         Mount inside a Suspense boundary in every authenticated layout.
 *         The resolver (app/(auth)/auth/resolver/route.ts) appends ?pending_consent=1
 *         when the user's accepted ToS/Privacy version is outdated.
 */
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ConsentGateModal } from "./ConsentGateModal"

function ConsentGateInner() {
  const searchParams = useSearchParams()
  if (searchParams.get("pending_consent") !== "1") return null
  return <ConsentGateModal />
}

export function ConsentGate() {
  return (
    <Suspense fallback={null}>
      <ConsentGateInner />
    </Suspense>
  )
}
