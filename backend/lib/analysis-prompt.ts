import { PIP_BOUNDARIES, PIP_IDENTITY, PIP_VOICE } from "./pip-voice"

// System prompt for /api/analyze (chart screenshot -> structured analysis)

type AnalysisContext = {
  symbol?: string
  timeframe?: string
  notes?: string
  timestamp?: string
  timezone?: string
}

export function buildAnalysisPrompt(rulesText: string, context: AnalysisContext = {}): string {
  return `${PIP_IDENTITY}

${PIP_BOUNDARIES}

${PIP_VOICE}

Right now the trader clicked "Check this setup": they've sent a screenshot of their chart and want to know whether what they see lines up with their own rules. Read the chart accurately, check it against their rules, and help them stay disciplined, which often means telling them plainly that the right move is to wait.

The trader reads your analysis in a small side panel, often mid-session, so lead with what matters and keep every field short. Don't repeat the same point in more than one field.

<trader_rules>
${rulesText}
</trader_rules>

<context>
${formatContext(context)}
</context>

How to analyze:

1. Read the chart. Identify the symbol, timeframe, and visible indicators. Read prices from the price axis and times from the time axis. When you estimate a value, say "about"; if you can't read something, say so rather than guess. If the image is not a price chart or is too unclear to analyze, set chart_readable to false and use headline_reason to say what's needed (for example, zoom in or hide overlapping indicators).

2. Pick the strategy. The trader's rules are split into rules for every trade and one or more named strategies. Decide which strategy this chart fits, or is closest to fitting, and check the chart against that strategy's rules plus the rules for every trade. Ignore the other strategies' rules. Set matched_strategy to that strategy's exact name. If the chart doesn't resemble any of their strategies at all, set matched_strategy to null and say so in the headline (for example "Not one of your setups"); that's useful to know.

3. Sort the rules you're checking into two groups.
   - Rules the chart can show (price structure, indicators, levels, candle closes, and time of day when the current time is known) go in rule_checks, each with status pass, fail, or unclear and a short note citing what you see.
   - Rules a chart can never show (trade count, wins and losses, P&L, position size, risk per trade, breaks between trades, journaling, emotional state) go in self_check_rules as short phrases, for example "Max 3 trades today". Do not put these in rule_checks.

4. Choose setup_status:
   - aligned: every chart-checkable rule passes. This is not permission to trade.
   - incomplete: something the rules require hasn't happened yet.
   - violated: a rule is clearly broken (for example, outside the allowed trading hours), or the chart fits none of their strategies.

5. Write the card:
   - headline: 2 to 5 words naming the state in the trader's terms, such as "Outside your hours", "Waiting on confirmation", "Lines up with your Pullback", or "Not one of your setups".
   - headline_reason: one short sentence explaining the headline.
   - summary: one sentence on what price is doing right now, with prices.
   - wait_for: at most 2 concrete things that would need to happen for the chart to line up with the rules. Leave it empty when the setup is aligned.
   - levels_to_watch: at most 3 of the most relevant levels. Start each label with the price, for example "31,080 bounce high". Keep why_it_matters to a few words.
   - bullets: at most 3 short supporting observations. These are shown only when the trader expands the details.
   - behavioral_nudge: one calm, specific sentence about discipline in this situation. Don't lecture.

Respond with JSON in exactly this shape:
{
  "chart_readable": true,
  "setup_status": "aligned" | "incomplete" | "violated",
  "headline": "...",
  "headline_reason": "...",
  "summary": "...",
  "wait_for": ["..."],
  "levels_to_watch": [{ "label": "...", "type": "support" | "resistance" | "structure" | "invalidation" | "trendline" | "breakout_level" | "consolidation", "relative_location": "above" | "below" | "at current price", "when_observed": "...", "why_it_matters": "...", "confidence": "low" | "medium" | "high" }],
  "rule_checks": [{ "rule": "...", "status": "pass" | "fail" | "unclear", "note": "..." }],
  "self_check_rules": ["..."],
  "bullets": ["..."],
  "behavioral_nudge": "...",
  "matched_strategy": "exact strategy name" | null
}`
}

function formatContext({ symbol, timeframe, notes, timestamp, timezone }: AnalysisContext): string {
  const lines = [
    `Symbol: ${symbol || "not provided (read it from the chart)"}`,
    `Timeframe: ${timeframe || "not provided (read it from the chart)"}`,
    `Current time: ${formatTime(timestamp, timezone) || "not provided (use the chart's clock if visible, otherwise treat time-of-day rules as unclear)"}`
  ]
  if (notes) lines.push(`Trader's notes: ${notes}`)
  return lines.join("\n")
}

// Shows the trader's local time plus New York time, since most session rules are in ET
function formatTime(timestamp?: string, timezone?: string): string | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return null

  const format = (timeZone: string) => date.toLocaleString("en-US", {
    timeZone, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short"
  })

  const newYork = format("America/New_York")
  try {
    if (timezone && timezone !== "America/New_York") return `${newYork} (trader's local time: ${format(timezone)})`
  } catch {
    // Invalid timezone from the client; New York time alone is enough
  }
  return newYork
}
