"use server"

/**
 * lib/actions/submitContactForm.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { createServiceClient } from "@/lib/supabase/server"
import { Resend } from "resend"
import { headers } from "next/headers"

/**
 * submitContactForm — public contact form server action.
 *
 * Pipeline:
 *   1. Validate input (lightweight — server-side only, the client also validates)
 *   2. Soft anti-spam: honeypot field check + rate limit per IP (in-memory ring)
 *   3. Insert into contact_leads via service-role
 *   4. Send notification email to Stéan via Resend
 *   5. Return { ok: true } on success or { ok: false, error: '...' } on failure
 *
 * NOT a transactional email — it doesn't go through lib/comms/send-email.ts
 * because that pipeline is org-scoped (template registry, communication_log,
 * branding fetch). The contact form is pre-org, so a direct Resend call is
 * appropriate.
 */

export type ContactIntent = "founding" | "support" | "general"

export interface ContactFormInput {
  name: string
  email: string
  phone?: string
  intent: ContactIntent
  message?: string
  /** Honeypot — should always be empty when submitted by a human */
  website?: string
}

export interface ContactFormResult {
  ok: boolean
  error?: string
}

// ── In-memory rate limit (per IP, per hour) ──────────────────────────────────
// Lightweight first-line defence. Production-grade would use Upstash or similar,
// but for a pre-launch contact form this catches casual abuse with zero deps.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000  // 1 hour
const RATE_LIMIT_MAX = 5                       // 5 submissions per IP per hour
const ipBuckets = new Map<string, number[]>()

function rateLimitOk(ip: string): boolean {
  const now = Date.now()
  const bucket = (ipBuckets.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (bucket.length >= RATE_LIMIT_MAX) return false
  bucket.push(now)
  ipBuckets.set(ip, bucket)
  return true
}

// ── Email validation (RFC-light, good enough for a contact form) ─────────────
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/

export async function submitContactForm(input: ContactFormInput): Promise<ContactFormResult> {
  // ── Honeypot ──
  // The form has a hidden `website` field. Bots often fill every field they see.
  // If this field arrives populated, treat as spam and silently drop.
  if (input.website && input.website.trim() !== "") {
    return { ok: true }  // pretend success — don't tell the bot
  }

  // ── Validate ──
  const name = input.name?.trim()
  const email = input.email?.trim().toLowerCase()
  const phone = input.phone?.trim() || null
  const message = input.message?.trim() || null
  const intent: ContactIntent =
    ["founding", "support", "general"].includes(input.intent) ? input.intent : "general"

  if (!name || name.length < 2) {
    return { ok: false, error: "Please tell me your name." }
  }
  if (!email || !EMAIL_RX.test(email)) {
    return { ok: false, error: "That email address doesn't look right." }
  }
  if (name.length > 200 || email.length > 320 || (message?.length ?? 0) > 5000) {
    return { ok: false, error: "Some of those fields are too long. Try shorter." }
  }

  // ── Rate limit ──
  const headersList = await headers()
  const forwardedFor = headersList.get("x-forwarded-for") || ""
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown"
  if (!rateLimitOk(ip)) {
    return { ok: false, error: "Too many submissions from this connection. Try again in an hour, or email Stéan directly." }
  }

  // ── Lightweight context for triage ──
  const userAgent = headersList.get("user-agent") || null
  const referrer = headersList.get("referer") || null

  // ── Insert into DB ──
  let leadId: string | null = null
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("contact_leads")
      .insert({
        name,
        email,
        phone,
        intent,
        message,
        user_agent: userAgent,
        referrer,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[submitContactForm] DB insert failed:", error)
      return { ok: false, error: "Couldn't save your message — please try again, or email Stéan directly." }
    }
    leadId = data.id as string
  } catch (e) {
    console.error("[submitContactForm] DB exception:", e)
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  // ── Send notification email to Stéan ──
  // Failure here is non-fatal — the lead is in the DB, Stéan can pick it up
  // from the admin view even if email delivery fails. Log and move on.
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: "Pleks Contact <notifications@pleks.co.za>",
      to: "stean@pleks.co.za",
      replyTo: email,
      subject: `[${intent.toUpperCase()}] ${name} via pleks.co.za`,
      text: [
        `New contact form submission`,
        ``,
        `Intent:   ${intent}`,
        `Name:     ${name}`,
        `Email:    ${email}`,
        `Phone:    ${phone ?? "(not provided)"}`,
        ``,
        `Message:`,
        message ?? "(no message)",
        ``,
        `─────`,
        `Lead ID:    ${leadId}`,
        `Referrer:   ${referrer ?? "(direct)"}`,
        `User agent: ${userAgent ?? "(unknown)"}`,
      ].join("\n"),
    })
  } catch (e) {
    console.error("[submitContactForm] Resend failed (lead saved anyway):", e)
    // Don't return failure — the lead is saved
  }

  // Lead saved, email sent (or attempted). Done.
  return { ok: true }
}
