import type { NextConfig } from "next"

// Browser security headers on every page
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  async redirects() {
    return [
      // Old links and shortcuts
      { source: "/quick-start", destination: "/guide", permanent: true },
      { source: "/login", destination: "https://admin.tradewithpip.ai/", permanent: false },
      { source: "/install", destination: "https://chromewebstore.google.com/detail/snapchart-trading-psychol/bppbpeodpbepcmjifjjihejcnofdnibe", permanent: false },
    ]
  },
}

export default nextConfig
