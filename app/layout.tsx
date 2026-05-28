/**
 * app/layout.tsx — Root HTML shell: fonts, metadata, global providers
 *
 * Notes:  Wraps every route. PWA manifest + theme-color live here.
 *         suppressHydrationWarning on body covers theme attribute injection.
 */
import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, DM_Sans, Inter_Tight, JetBrains_Mono } from "next/font/google"
import { Toaster } from "sonner"
import { QueryProvider } from "@/components/providers/QueryProvider"
import { OfflineIndicator } from "@/components/layout/OfflineIndicator"
import { InstallPrompt } from "@/components/layout/InstallPrompt"
import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
})

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const interTight = Inter_Tight({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "Pleks — Property Management",
    template: "%s | Pleks",
  },
  description:
    "South African property management platform. Smarter inspections, automated collections, legal-grade compliance.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg?v=8",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pleks",
  },
}

export const viewport: Viewport = {
  themeColor: "#E8A838",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${plusJakartaSans.variable} ${dmSans.variable} ${interTight.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <OfflineIndicator />
        <QueryProvider>
          {children}
        </QueryProvider>
        <InstallPrompt />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
