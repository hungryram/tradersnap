import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old links and shortcuts
      { source: "/quick-start", destination: "/guide", permanent: true },
      { source: "/login", destination: "https://admin.snapchartapp.com/", permanent: false },
      { source: "/install", destination: "https://chromewebstore.google.com/detail/snapchart-trading-psychol/bppbpeodpbepcmjifjjihejcnofdnibe", permanent: false },
    ]
  },
}

export default nextConfig
