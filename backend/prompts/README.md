# Trading Buddy AI Prompts

This directory contains different versions of the AI coaching prompts.

## Files

### Active Prompts
The prompts currently in use are in:
- `backend/app/api/chat/route.ts` (chat conversations)
- `backend/app/api/analyze/route.ts` (chart analysis)

### Archived Versions

**Safe/Compliant Versions** (January 2026)
- `chat-prompt-safe-version.md` - Original cautious chat prompt
- `analyze-prompt-safe-version.md` - Original cautious analyze prompt

**Characteristics:**
- Very defensive, prioritizes legal safety
- Overly cautious language ("I can't make that call for you")
- Always asks "Are you in a position or considering a setup?"
- Past tense only, no conviction
- Generic behavioral coaching
- **User feedback:** Too boring, no engagement, felt robotic

**Engaging Versions** (January 2026)
- Currently active in the codebase
- Direct, confident, uses trader slang
- Calls out emotional trading (FOMO, revenge)
- Short punchy responses
- Challenges users with better questions
- Still doesn't give signals but way more interesting

## How to Switch Prompts

To revert to the safe version:

1. Copy the prompt from `chat-prompt-safe-version.md` or `analyze-prompt-safe-version.md`
2. Replace the `coachingPrompt` string in the respective route file
3. Rebuild: `pnpm build`
4. Redeploy

## When to Use Which Version

**Use Safe Version When:**
- Concerned about regulatory scrutiny
- Launching in heavily regulated market
- Want maximum legal defensibility
- User retention is less important than compliance

**Use Engaging Version When:**
- Want actual user engagement
- Trading in personality/retention
- Confident in "coach not advisor" distinction
- Users are getting bored and churning

## Legal Notes

Both versions:
- Never provide specific trade signals
- Never say "buy at X" or "sell at Y"
- Never predict future price movements
- Focus on psychology coaching and rule adherence

Difference is in tone and personality, not in legal boundaries.
