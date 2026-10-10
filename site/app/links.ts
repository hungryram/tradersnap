// Where the site sends people; override per environment on Vercel if needed
export const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ||
  "https://chromewebstore.google.com/detail/snapchart-trading-psychol/bppbpeodpbepcmjifjjihejcnofdnibe"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://admin.snapchartapp.com"
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.snapchartapp.com"
export const DISCORD_URL = "https://discord.gg/fuxFDEsDph"
export const FEATURE_REQUESTS_URL = "https://snapchart.canny.io/"
export const SUPPORT_EMAIL = "help@snapchartapp.com"
