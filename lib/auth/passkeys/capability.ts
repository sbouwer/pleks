"use client"

/**
 * lib/auth/passkeys/capability.ts — Client-side WebAuthn capability detection
 *
 * Notes: must be "use client" — PublicKeyCredential only exists in the browser.
 *        Check both discoverable (autofill passkeys) and platform (Touch ID / Windows Hello).
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
