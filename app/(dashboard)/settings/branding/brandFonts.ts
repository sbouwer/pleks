/**
 * app/(dashboard)/settings/branding/brandFonts.ts — self-hosted brand fonts for the Branding previews
 *
 * Notes:  Loaded via next/font (build-time, self-hosted) so the Font-option tiles + document preview render
 *         in their real typefaces under Pleks's strict CSP — the external Google Fonts CDN is blocked, which
 *         left the previews falling back to system sans/serif (all four looked identical in pairs). Imported
 *         by the server page; the `.variable` classNames are handed to BrandingForm and applied to the tiles.
 *         NOT a "use client" module — next/font loaders can't be imported into client components directly.
 */
import { Inter, Lato, Merriweather, Playfair_Display } from "next/font/google"

export const brandInter = Inter({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-brand-inter", display: "swap" })
export const brandLato = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-brand-lato", display: "swap" })
export const brandMerriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-brand-merriweather", display: "swap" })
export const brandPlayfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-brand-playfair", display: "swap" })

/** Combined variable classNames — apply to a wrapper so `var(--font-brand-*)` resolves on the tiles. */
export const brandFontVars = `${brandInter.variable} ${brandLato.variable} ${brandMerriweather.variable} ${brandPlayfair.variable}`
