"use client"

/**
 * app/(public)/contact/ContactForm.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { submitContactForm, type ContactIntent } from "@/lib/actions/submitContactForm"

const INTENT_OPTIONS: { value: ContactIntent; label: string; hint: string }[] = [
  { value: "founding", label: "Founding-agent cohort",   hint: "Ten seats, three claimed. I'll be in touch." },
  { value: "support",  label: "I'm a customer",          hint: "Already on Pleks? Tell me what's going on." },
  { value: "general",  label: "Something else",          hint: "Press, partnerships, or just a question." },
]

export function ContactForm({ defaultIntent = "general" as ContactIntent }) {
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Allow ?intent=founding / ?intent=support to pre-select the dropdown
  const intentFromUrl = searchParams.get("intent") as ContactIntent | null
  const initialIntent: ContactIntent =
    intentFromUrl && ["founding", "support", "general"].includes(intentFromUrl)
      ? intentFromUrl
      : defaultIntent

  const [intent, setIntent] = useState<ContactIntent>(initialIntent)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const input = {
      name:    String(formData.get("name") ?? ""),
      email:   String(formData.get("email") ?? ""),
      phone:   String(formData.get("phone") ?? ""),
      intent,
      message: String(formData.get("message") ?? ""),
      // Honeypot — hidden field, must remain empty
      website: String(formData.get("website") ?? ""),
    }

    startTransition(async () => {
      const result = await submitContactForm(input)
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.")
        return
      }
      setSubmitted(true)
    })
  }

  if (submitted) {
    return (
      <div className="contact-form-success">
        <div className="contact-form-success-eyebrow">
          <span className="amber-rule" />MESSAGE SENT
        </div>
        <h3 style={{ margin: "0 0 12px", fontSize: 22, letterSpacing: "-0.015em", fontWeight: 500 }}>
          Thanks — I&apos;ll be in touch.
        </h3>
        <p style={{ margin: 0, fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6 }}>
          Your message landed in my inbox. I read every one within the working day, and most replies go out the same day.
          If it&apos;s urgent, the WhatsApp number on this page reaches me too.
        </p>
      </div>
    )
  }

  const submitLabel = "Send message →"

  return (
    <form onSubmit={handleSubmit} className="contact-form" noValidate>
      {/* Honeypot — hidden from humans, irresistible to bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
      />

      <div className="contact-form-field">
        <label htmlFor="contact-name" className="contact-form-label">
          Your name
        </label>
        <input
          id="contact-name"
          type="text"
          name="name"
          required
          autoComplete="name"
          className="contact-form-input"
          placeholder=""
        />
      </div>

      <div className="contact-form-field">
        <label htmlFor="contact-email" className="contact-form-label">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          className="contact-form-input"
          placeholder=""
        />
      </div>

      <div className="contact-form-field">
        <label htmlFor="contact-phone" className="contact-form-label">
          Phone <span className="contact-form-label-aside">optional</span>
        </label>
        <input
          id="contact-phone"
          type="tel"
          name="phone"
          autoComplete="tel"
          className="contact-form-input"
          placeholder=""
        />
      </div>

      <fieldset className="contact-form-field" style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="contact-form-label">
          What&apos;s this about?
        </legend>
        <div className="contact-form-intent">
          {INTENT_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={`contact-form-intent-option ${intent === opt.value ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="intent"
                value={opt.value}
                checked={intent === opt.value}
                onChange={() => setIntent(opt.value)}
              />
              <span className="contact-form-intent-label">{opt.label}</span>
              <span className="contact-form-intent-hint">{opt.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="contact-form-field">
        <label htmlFor="contact-message" className="contact-form-label">
          Anything you want to add <span className="contact-form-label-aside">optional</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          className="contact-form-input contact-form-textarea"
          placeholder=""
        />
      </div>

      {error && (
        <div className="contact-form-error" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-pleks"
        disabled={isPending}
        style={{ marginTop: 8, width: "fit-content" }}
      >
        {isPending ? "Sending…" : submitLabel}
      </button>

      <p className="contact-form-footnote">
        Your details land in my inbox and stay there. No CRM, no drip sequence, no SDR.
      </p>
    </form>
  )
}
