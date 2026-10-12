import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { smallJson } from "./llm"
import type { LlmUsage as TokenUsage } from "./llm-cost"

// Traders tell Pip how they did ("just made 200", "got stopped out for -150").
// This spots those messages so the app can offer to log them. Nothing is logged
// without the trader's tap.

// Cheap gate so only messages that could report a result reach the model
const HAS_AMOUNT = /\$\s?\d|\b\d[\d,]*(\.\d+)?\s?(k|bucks|dollars|usd)\b|\b\d{2,}\b/i
const HAS_RESULT = /\b(made|make|won|win|lost|lose|loss|profit|profited|up|down|green|red|stopped|took|banked|booked|closed|hit|nailed|blew|gave back|p&l|pnl)\b/i

export const mightReportResult = (message: string) =>
  message.length <= 300 && HAS_AMOUNT.test(message) && HAS_RESULT.test(message)

// "-150" or "$200" on its own, answering Pip's "how much was it?" after the trader asked to log a trade
const BARE_AMOUNT = /^\s*[-+]?\s?\$?\s?\d[\d,]*(\.\d+)?\s?(k|dollars|bucks|usd)?\s*$/i
const answersLogRequest = (message: string, recent: string) => BARE_AMOUNT.test(message) && /\blog\b/i.test(recent)

const claimSchema = z.object({
  reported_trade: z.boolean(),
  amount: z.number().nullable(),
  symbol: z.string().nullable(),
  kind: z.enum(["trade", "day_total", "unclear"])
})

// trade: one position. day_total: their running total for the day. unclear: could be either.
export type ClaimKind = "trade" | "day_total" | "unclear"
export type TradeClaim = { amount: number; symbol: string | null; kind: ClaimKind }

// `recent` is the last couple of turns of the conversation, as plain text
export async function detectTradeClaim(message: string, recent = ""): Promise<{ claim: TradeClaim | null; tokens: TokenUsage | null }> {
  if (!mightReportResult(message) && !answersLogRequest(message, recent)) return { claim: null, tokens: null }
  try {
    const { output, tokens } = await smallJson({
      system: `You read one message from a trader to their coach and decide whether they are reporting the result of a trade (or session) that already happened, in dollars.
reported_trade is true only when they state a result that already happened with a dollar amount, like "just made 200", "lost $150 on that one", "got stopped out for -75", "up 400 today".
It is false for: questions, hypotheticals ("if I make 200"), goals ("I want to make 500"), plans, account sizes, prices, stop distances, and results in points, ticks or percent with no dollar amount.
amount is the signed dollar result: positive for a gain, negative for a loss. Use null when reported_trade is false.
symbol is the ticker if they named one (like NQ, ES, AAPL), else null.
kind says what the amount covers: "trade" for one position ("made 200 on that NQ long", "that last trade lost 150"), "day_total" when it is their running total for the day or session ("up 381 total for the day", "I'm green 400 today", "down 600 on the day"), and "unclear" when it could be either ("I'm up 381", "made 200 today" with no sign they traded once). Set kind to "trade" when reported_trade is false.
If the message is only an amount, it answers a question about a trade the trader asked to log. Use the recent conversation to decide: a loser, loss or stop-out is negative, a winner is positive. If you can't tell the sign, reported_trade is false.`,
      prompt: recent ? `Recent conversation:\n${recent}\n\nLatest message from the trader: ${message}` : message,
      schema: claimSchema,
      maxTokens: 150
    })
    if (!output.reported_trade || output.amount === null || !Number.isFinite(output.amount) || output.amount === 0 || Math.abs(output.amount) > 1_000_000) {
      return { claim: null, tokens }
    }
    const symbol = output.symbol?.replace(/[^A-Za-z0-9:._!-]/g, "").slice(0, 20).toUpperCase() || null
    return { claim: { amount: Math.round(output.amount * 100) / 100, symbol, kind: output.kind }, tokens }
  } catch (error) {
    console.error("[Trade claim] Detection failed:", error)
    return { claim: null, tokens: null }
  }
}

// An auto-detected trade that closed around the same time with about the same P&L
// is probably the one they're talking about, so don't log it twice.
export async function alreadyLogged(supabase: SupabaseClient, userId: string, amount: number, nearTime = new Date()): Promise<boolean> {
  const { data } = await supabase
    .from("trades")
    .select("realized_pnl")
    .eq("user_id", userId)
    .gte("closed_at", new Date(nearTime.getTime() - 20 * 60 * 1000).toISOString())
    .lte("closed_at", new Date(nearTime.getTime() + 5 * 60 * 1000).toISOString())
    .limit(50)
  const tolerance = Math.max(1, Math.abs(amount) * 0.02)
  return (data ?? []).some(t => t.realized_pnl !== null && Math.abs(Number(t.realized_pnl) - amount) <= tolerance)
}

// What the journal already holds for today: the net (day-total entries included) and the number of real trades
export async function loggedToday(supabase: SupabaseClient, userId: string, dayStart: Date): Promise<{ net: number; count: number }> {
  let { data, error }: { data: unknown[] | null; error: unknown } = await supabase
    .from("trades")
    .select("realized_pnl, kind")
    .eq("user_id", userId)
    .gte("closed_at", dayStart.toISOString())
    .limit(500)
  if (error) ({ data, error } = await supabase.from("trades").select("realized_pnl").eq("user_id", userId).gte("closed_at", dayStart.toISOString()).limit(500)) // before 20261024_day_totals.sql
  const rows = (data ?? []) as { realized_pnl: number | null; kind?: string }[]
  return {
    net: Math.round(rows.reduce((sum, t) => sum + Number(t.realized_pnl ?? 0), 0) * 100) / 100,
    count: rows.filter(t => t.kind !== "day_total").length
  }
}
