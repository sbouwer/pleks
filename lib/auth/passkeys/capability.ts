"use client"

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
