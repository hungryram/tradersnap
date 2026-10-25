import { APP_ORIGINS, SITE_ORIGINS } from "./urls"

// Which web pages may call the API from a browser: the dashboard, the marketing site, the extension, and the trading
// platforms the extension's chat runs on (its requests carry the page's origin). Requests are authorized by the
// user's token, not cookies, so this is defence in depth: other sites get no CORS headers and can't read responses.
const PLATFORM_DOMAINS = [
  "tradingview.com", "tradovate.com", "topstepx.com", "thinkorswim.com", "tdameritrade.com", "ninjatrader.com",
  "tradestation.com", "interactivebrokers.com", "etrade.com", "schwab.com", "fidelity.com", "robinhood.com",
  "webull.com", "tastytrade.com", "tastyworks.com", "metatrader4.com", "metatrader5.com", "ctrader.com", "tradier.com",
  "lightspeed.com", "speedtrader.com", "rithmic.com", "binance.com", "coinbase.com", "kraken.com", "bybit.com"
]

export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false
  if (APP_ORIGINS.includes(origin) || SITE_ORIGINS.includes(origin)) return true
  if (origin.startsWith("chrome-extension://")) return true
  if (process.env.NODE_ENV !== "production" && /^http:\/\/localhost(:\d+)?$/.test(origin)) return true
  let host: string
  try {
    const url = new URL(origin)
    if (url.protocol !== "https:") return false
    host = url.hostname
  } catch {
    return false
  }
  // The domain itself or a subdomain of it ("evil-tradingview.com" and "tradingview.com.evil.io" don't match)
  return PLATFORM_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))
}
