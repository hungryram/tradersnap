// Where the site sends people; override per environment on Vercel if needed
export const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ||
  "https://chromewebstore.google.com/detail/snapchart-trading-psychol/bppbpeodpbepcmjifjjihejcnofdnibe"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.tradewithpip.ai"
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tradewithpip.ai"
export const SUPPORT_EMAIL = "help@snapchartapp.com"
