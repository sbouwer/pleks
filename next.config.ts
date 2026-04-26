import type { NextConfig } from "next"
import withSerwist from "@serwist/next"

const securityHeaders = [
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer information
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser feature access
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Enforce HTTPS (2 years, include subdomains)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Content Security Policy
  // Note: 'unsafe-inline' + 'unsafe-eval' required by Next.js App Router hydration.
  // Nonce-based CSP can be added once streaming/hydration patterns are confirmed stable.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com",
      "frame-src https://maps.google.com https://www.google.com",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  // Remove X-Powered-By: Next.js header
  poweredByHeader: false,

  // Silence the Turbopack/webpack mismatch warning from @serwist/next.
  // Serwist is disabled in development so webpack only runs in production builds.
  turbopack: {},

  async redirects() {
    return [
      // ── Route-naming renames ──
      { source: "/payments",           destination: "/billing",            permanent: true },
      { source: "/payments/:path*",    destination: "/billing/:path*",     permanent: true },

      { source: "/contractors",        destination: "/suppliers",          permanent: true },
      { source: "/contractors/:path*", destination: "/suppliers/:path*",   permanent: true },

      { source: "/settings/finance",   destination: "/settings/deposits",  permanent: true },
      { source: "/settings/billing",   destination: "/settings/subscription", permanent: true },
      { source: "/settings/communication/templates", destination: "/settings/documents/templates", permanent: true },
      { source: "/settings/communication/:path*",    destination: "/settings/documents/:path*",    permanent: true },

      { source: "/api/payments/screening",                destination: "/api/billing/screening",                permanent: true },
      { source: "/api/payments/:paymentId/receipt",       destination: "/api/billing/:paymentId/receipt",       permanent: true },
      { source: "/api/contractors",                       destination: "/api/suppliers",                        permanent: true },
      { source: "/api/contractors/:path*",                destination: "/api/suppliers/:path*",                 permanent: true },

      // ── Role namespace renames ──
      { source: "/portal",             destination: "/tenant",             permanent: true },
      { source: "/portal/:path*",      destination: "/tenant/:path*",      permanent: true },

      { source: "/contractor",         destination: "/supplier",           permanent: true },
      { source: "/contractor/:path*",  destination: "/supplier/:path*",    permanent: true },

      // /landlord/* unchanged — route group renamed but URL prefix stays the same.
      // /settings/profile NOT redirected — URL is repurposed (new user-profile stub), not retired.
    ]
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})(nextConfig)
