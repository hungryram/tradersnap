export interface RuleTemplate {
  name: string
  description: string
  rules: string
  category: "trend" | "structure" | "mean-reversion" | "momentum" | "beginner"
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    name: "EMA Pullback (Trend Continuation)",
    description: "Trade pullbacks to 9/20 EMA in trending markets - Most Popular",
    category: "trend",
    rules: `ENTRY RULES:
- Trade only in direction of trend
- 9 EMA above 20 EMA for longs (reverse for shorts)
- Wait for price to pull back into EMAs
- Entry only after confirmation candle closes with momentum
- HTF bias must align with trade direction

EXIT RULES:
- Stop below pullback low (above for shorts)
- Target next structure level or 2:1 minimum R:R
- Trail stop using 9 EMA once 1:1 is hit

DISCIPLINE:
- No chasing extended candles away from EMAs
- Risk ≤ max R per trade
- Pullback must be shallow (no deep reclaim of EMAs)
- Max 3 trades per session`
  },
  {
    name: "Break & Retest (Structure)",
    description: "Wait for structure breaks to retest before entering",
    category: "structure",
    rules: `ENTRY RULES:
- Identify clear support/resistance before break
- Wait for break with acceptance (not just a wick)
- Enter on the retest, NOT the break
- Confirmation candle required on retest (rejection or hold)
- Break must occur with volume/momentum

EXIT RULES:
- Stop placed beyond structure
- Target: 2:1 minimum R:R or next structure level
- Exit if structure fails to hold on retest

DISCIPLINE:
- No FOMO entries during the break
- Level must be clearly defined BEFORE the break
- Maximum 2 attempts per level
- If retest doesn't come, move on`
  },
  {
    name: "Trendline Bounces & Breaks",
    description: "Trade bounces off trendlines or breaks with confirmation",
    category: "structure",
    rules: `DRAWING RULES:
- Trendline must connect at least 3 touches
- Draw from swing high to swing high (resistance) or low to low (support)
- Trendline must be respected (price reacts at line, not random)
- Use higher timeframe trendlines for stronger signals

ENTRY RULES (Bounce):
- Price approaches trendline
- Wait for rejection candle at the line (wick + close away from line)
- Enter on next candle in direction of trend
- Volume should decrease on approach, increase on bounce

ENTRY RULES (Break):
- Clear break of trendline with strong momentum candle
- Wait for retest of broken trendline
- Enter on rejection from opposite side
- Break must be convincing (not just a wick)

EXIT RULES:
- Stop: Beyond the trendline (bounce) or beyond retest (break)
- Target: Next structure level or opposing trendline
- Exit if trendline is broken (for bounce trades)

DISCIPLINE:
- No forcing lines to fit your bias
- Trendline must be obvious and clean
- Maximum 2 entries per trendline
- If price isn't respecting the line, abandon it`
  },
  {
    name: "Opening Range Breakout (ORB)",
    description: "Trade breakouts of the first 15-minute range",
    category: "momentum",
    rules: `ENTRY RULES:
- Mark first 15 minutes as opening range
- Trade only breaks of this range high/low
- Entry only outside the range with momentum
- No mid-range entries allowed

EXIT RULES:
- Stop inside the opening range
- Target: 2x range size or key level
- Exit if price re-enters range

DISCIPLINE:
- One or two attempts maximum per session
- No chasing late breaks (after 30+ min)
- If no clear break in first hour, no trades
- Trade mornings only (first 2 hours)`
  },
  {
    name: "VWAP Mean Reversion",
    description: "Fade extensions from VWAP in ranging markets",
    category: "mean-reversion",
    rules: `ENTRY RULES:
- Price extended far from VWAP (look for exhaustion, not momentum)
- Market must be balanced or ranging (no strong HTF trend)
- Enter only on rejection candle back toward VWAP
- Look for signs of exhaustion (wicks, volume decline)

EXIT RULES:
- Stop beyond the extreme (last high/low)
- Target: VWAP or midpoint between entry and VWAP
- Exit if momentum continues away from VWAP

DISCIPLINE:
- Reduce size if against HTF trend
- Maximum 3 fades per session
- No entries if trending strongly
- Wait for clear rejection, don't predict tops/bottoms`
  },
  {
    name: "Range High/Low Trading",
    description: "Buy support, sell resistance in defined ranges",
    category: "mean-reversion",
    rules: `ENTRY RULES:
- Clear range high and low identified
- HTF shows no strong directional trend
- Entry ONLY at range extremes (high or low)
- Confirmation candle required at level

EXIT RULES:
- Target: Opposite side of range
- Stop: Just beyond range boundary
- Exit if range breaks with volume

DISCIPLINE:
- No trades in the middle of the range
- No breakout anticipation trades
- Maximum 4 touches per session
- If range breaks, wait for new structure`
  },
  {
    name: "Momentum Continuation (Flag Breaks)",
    description: "Catch continuation after strong impulse moves",
    category: "momentum",
    rules: `ENTRY RULES:
- Strong impulse leg clearly defined
- Consolidation/flag is tight (no deep pullback)
- Entry on break of consolidation with volume
- No late entries after extension

EXIT RULES:
- Stop below consolidation
- Target: Length of impulse move projected
- Exit if consolidation expands (losing structure)

DISCIPLINE:
- Entry on continuation, NOT during the spike
- Must have clear impulse → pause → continuation structure
- Maximum 2 attempts per setup
- Avoid if already extended from major level`
  },
  {
    name: "Discipline Starter Pack",
    description: "Focus on risk management before strategy - Perfect for beginners",
    category: "beginner",
    rules: `SESSION RULES:
- Trade only during defined hours (e.g., 9:30-11:30 AM ET)
- Maximum 3 trades per day
- Stop trading after 2 consecutive losses
- Required 15-minute break between trades

RISK RULES:
- Maximum loss per day: $[SET YOUR LIMIT]
- Maximum risk per trade: 1% of account
- Position size must be calculated before entry
- Screenshot required before every trade

REFLECTION REQUIRED:
- State reason for trade BEFORE entry
- Check emotional state (FOMO? Revenge? Calm?)
- Review trades at end of session

NO STRATEGY YET:
This ruleset focuses purely on discipline and process.
Once you master these habits, add your strategy rules.`
  }
]
