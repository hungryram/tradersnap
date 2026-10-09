export type Side = "long" | "short"

// One executed order from the platform's order history
export type Fill = {
  orderId: string
  symbol: string
  qty: number // positive = buy, negative = sell
  price: number
  time: number // ms since epoch
  commission: number | null
}

export type ClosedTrade = {
  client_trade_id: string
  platform: "tradingview" | "tradovate" | "topstepx"
  account: string | null
  symbol: string
  side: Side
  qty: number // largest position size during the trade
  entry_price: number | null
  exit_price: number | null
  fill_count: number
  realized_pnl: number | null
  pnl_source: "realized" | "estimated"
  opened_at: string | null
  closed_at: string
}

// Platforms format numbers like "−2,076.00 USD" (Unicode minus, commas,
// currency) or "31.158,00" in European locales
export function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null
  let cleaned = text.replace(/[−‒–—]/g, "-").replace(/[\s ‪-‮']/g, "")
  const match = cleaned.match(/[-+]?[\d.,]*\d/)
  if (!match) return null
  cleaned = match[0]

  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal separator
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "")
  } else if (lastComma > -1) {
    // "1,234" is thousands; "12,5" or "12,50" is a decimal comma
    const decimals = cleaned.length - lastComma - 1
    cleaned = decimals === 3 && /^[-+]?\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/,/g, ".")
  }

  const value = parseFloat(cleaned)
  return isNaN(value) ? null : value
}
