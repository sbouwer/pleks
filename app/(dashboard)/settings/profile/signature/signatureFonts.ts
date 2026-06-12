/**
 * app/(dashboard)/settings/profile/signature/signatureFonts.ts — self-hosted handwriting fonts (Type method)
 *
 * Notes:  Loaded via next/font (build-time, self-hosted) so the typed-name signature/initial renders in a
 *         handwriting style under Pleks's strict CSP. NOT a "use client" module — next/font loaders can't be
 *         imported into client components. The server page hands `signatureFontVars` (wrapper classNames) +
 *         SIGNATURE_FONTS (family strings, for the live preview + canvas render) to SignatureSettings.
 */
import { Dancing_Script, Great_Vibes, Sacramento, Caveat, Allura } from "next/font/google"

const dancing = Dancing_Script({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-dancing", display: "swap" })
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-greatvibes", display: "swap" })
const sacramento = Sacramento({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-sacramento", display: "swap" })
const caveat = Caveat({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-caveat", display: "swap" })
const allura = Allura({ subsets: ["latin"], weight: ["400"], variable: "--font-sig-allura", display: "swap" })

export interface SignatureFont { id: string; label: string; family: string }

export const SIGNATURE_FONTS: SignatureFont[] = [
  { id: "dancing", label: "Dancing Script", family: dancing.style.fontFamily },
  { id: "greatvibes", label: "Great Vibes", family: greatVibes.style.fontFamily },
  { id: "sacramento", label: "Sacramento", family: sacramento.style.fontFamily },
  { id: "caveat", label: "Caveat", family: caveat.style.fontFamily },
  { id: "allura", label: "Allura", family: allura.style.fontFamily },
]

/** Combined variable classNames — apply to a wrapper so the @font-face faces load + the families resolve. */
export const signatureFontVars = `${dancing.variable} ${greatVibes.variable} ${sacramento.variable} ${caveat.variable} ${allura.variable}`
