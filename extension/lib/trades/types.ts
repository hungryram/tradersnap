export type Side = "long" | "short"

export type Position = {
  symbol: string
  side: Side
  qty: number
  avgPrice: number | null
  unrealizedPnl: number | null
}

// What a platform reader sees on the page at one moment
export type Snapshot = {
  account: string | null
  realizedPnl: number | null
  positions: Map<string, Position>
}

export type ClosedTrade = {
  client_trade_id: string
  platform: "tradingview" | "tradovate" | "topstepx"
  account: string | null
  symbol: string
  side: Side
  qty: number
  entry_price: number | null
  realized_pnl: number | null
  pnl_source: "realized" | "estimated"
  opened_at: string | null
  closed_at: string
}

// Platforms format numbers like "−2,076.00 USD" (Unicode minus, commas, currency)
export function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null
  const cleaned = text.replace(/[−‒–—]/g, "-").replace(/[,\s‪-‮]/g, "")
  const match = cleaned.match(/[-+]?\d+(\.\d+)?/)
  if (!match) return null
  const value = parseFloat(match[0])
  return isNaN(value) ? null : value
}
