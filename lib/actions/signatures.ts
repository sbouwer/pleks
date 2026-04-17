"use server"

import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { randomUUID } from "node:crypto"

export async function saveSignatureDataUrl(
  dataUrl: string,
  source: "mouse_desktop" | "typed_name",
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  // Convert base64 data URL to Buffer
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64, "base64")

  const filename = `${randomUUID()}.png`
  const storagePath = `${orgId}/${userId}/${filename}`

  const { error: uploadError } = await db.storage
    .from("signatures")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: false })

  if (uploadError) {
    console.error("saveSignatureDataUrl upload:", uploadError.message)
    return { error: "Could not upload signature" }
  }

  // Deactivate existing active signatures
  const { error: deactivateError } = await db
    .from("user_signatures")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true)

  if (deactivateError) {
    console.error("saveSignatureDataUrl deactivate:", deactivateError.message)
    return { error: "Could not update existing signatures" }
  }

  // Insert new active signature
  const { error: insertError } = await db.from("user_signatures").insert({
    user_id: userId,
    org_id: orgId,
    storage_path: storagePath,
    source,
    is_active: true,
  })

  if (insertError) {
    console.error("saveSignatureDataUrl insert:", insertError.message)
    return { error: "Could not save signature record" }
  }

  return {}
}

export async function saveSignatureFile(formData: FormData): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const file = formData.get("file") as File | null
  if (!file) return { error: "No file provided" }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const filename = `${randomUUID()}.png`
  const storagePath = `${orgId}/${userId}/${filename}`

  const { error: uploadError } = await db.storage
    .from("signatures")
    .upload(storagePath, buffer, { contentType: file.type || "image/png", upsert: false })

  if (uploadError) {
    console.error("saveSignatureFile upload:", uploadError.message)
    return { error: "Could not upload signature" }
  }

  // Deactivate existing active signatures
  const { error: deactivateError } = await db
    .from("user_signatures")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true)

  if (deactivateError) {
    console.error("saveSignatureFile deactivate:", deactivateError.message)
    return { error: "Could not update existing signatures" }
  }

  // Insert new active signature
  const { error: insertError } = await db.from("user_signatures").insert({
    user_id: userId,
    org_id: orgId,
    storage_path: storagePath,
    source: "uploaded_file",
    is_active: true,
  })

  if (insertError) {
    console.error("saveSignatureFile insert:", insertError.message)
    return { error: "Could not save signature record" }
  }

  return {}
}

export async function removeSignature(): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId } = gw

  const { error } = await db
    .from("user_signatures")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true)

  if (error) {
    console.error("removeSignature:", error.message)
    return { error: "Could not remove signature" }
  }

  return {}
}

/**
 * Creates a one-time token for the QR phone-capture flow.
 * Token expires in 10 minutes. The mobile page at /sign-signature/[token]
 * validates this token before showing the signature pad.
 */
export async function createSignatureToken(): Promise<{ error?: string; token?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await db.from("signature_sign_tokens").insert({
    token,
    user_id: userId,
    org_id: orgId,
    expires_at: expiresAt,
  })

  if (error) {
    console.error("createSignatureToken:", error.message)
    return { error: "Could not create QR token" }
  }

  return { token }
}

/**
 * Checks whether the one-time sign token has been consumed (phone capture complete).
 * Used by the QR polling loop in SignatureSettings.
 */
export async function checkTokenConsumed(token: string): Promise<{ consumed: boolean }> {
  const gw = await gateway()
  if (!gw) return { consumed: false }
  const { db, userId } = gw

  const { data } = await db
    .from("signature_sign_tokens")
    .select("consumed_at")
    .eq("token", token)
    .eq("user_id", userId)
    .single()

  return { consumed: !!data?.consumed_at }
}

interface SaveFromMobileParams {
  token: string
  userId: string
  orgId: string
  dataUrl: string
}

/**
 * Token-authenticated save for the public mobile signature capture flow.
 * Validates the one-time token, uploads the signature, and marks the token consumed.
 */
export async function saveSignatureFromMobile(
  params: SaveFromMobileParams,
): Promise<{ error?: string }> {
  const { token, userId, orgId, dataUrl } = params
  const db = await createServiceClient()

  // Validate token
  const { data: tokenRow, error: tokenError } = await db
    .from("signature_sign_tokens")
    .select("token, user_id, org_id, expires_at, consumed_at")
    .eq("token", token)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single()

  if (tokenError || !tokenRow) return { error: "Invalid token" }
  if (tokenRow.consumed_at) return { error: "Token already used" }
  if (new Date(tokenRow.expires_at) < new Date()) return { error: "Token expired" }

  // Upload signature
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64, "base64")
  const filename = `${randomUUID()}.png`
  const storagePath = `${orgId}/${userId}/${filename}`

  const { error: uploadError } = await db.storage
    .from("signatures")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: false })

  if (uploadError) {
    console.error("saveSignatureFromMobile upload:", uploadError.message)
    return { error: "Could not upload signature" }
  }

  // Deactivate existing active signatures
  await db
    .from("user_signatures")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true)

  // Insert new active signature
  const { error: insertError } = await db.from("user_signatures").insert({
    user_id: userId,
    org_id: orgId,
    storage_path: storagePath,
    source: "qr_phone",
    is_active: true,
  })

  if (insertError) {
    console.error("saveSignatureFromMobile insert:", insertError.message)
    return { error: "Could not save signature record" }
  }

  // Mark token consumed
  await db
    .from("signature_sign_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", token)

  return {}
}
