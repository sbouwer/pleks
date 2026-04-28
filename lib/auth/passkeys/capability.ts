"use client"

/**
 * lib/auth/passkeys/capability.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

export interface PasskeyCapability {
  available: boolean
  discoverable: boolean
  platform: boolean
}

export async function canUsePasskeys(): Promise<PasskeyCapability> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { available: false, discoverable: false, platform: false }
  }

  const [discoverable, platform] = await Promise.all([
    PublicKeyCredential.isConditionalMediationAvailable?.() ?? Promise.resolve(false),
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? Promise.resolve(false),
  ])

  return { available: true, discoverable, platform }
}
