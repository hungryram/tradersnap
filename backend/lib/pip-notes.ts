import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { smallJson } from "./llm"
import { logLlmUsage } from "./llm-cost"

// Pip's notes: short facts Pip keeps about a trader across days. Pip writes them
// (at most once a day, from new conversations, with a small cheap model) and the
// trader can read, edit, add and delete them on the dashboard's Memory page.

export type PipNote = { id: string; text: string; source: "pip" | "user"; updated_at: string }

export const MAX_NOTES = 30          // shown to Pip, newest first
const MAX_PIP_NOTES = 20             // notes Pip writes itself
const NOTE_MAX_CHARS = 160
const MIN_NEW_MESSAGES = 4           // don't spend a request on one or two messages
const REFRESH_EVERY_MS = 20 * 60 * 60 * 1000
const MAX_MESSAGES_READ = 60
const MESSAGE_MAX_CHARS = 600

export async function loadNotes(supabase: SupabaseClient, userId: string): Promise<PipNote[]> {
  const { data, error } = await supabase
    .from("pip_notes")
    .select("id, text, source, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_NOTES)
  if (error) return [] // table missing until 20261017_memory_and_costs.sql runs
  return (data ?? []) as PipNote[]
}

// The memory block Pip sees (cached with the system prompt)
export function memoryContext(notes: PipNote[], patterns: string[]): string | null {
  const parts: string[] = []
  if (notes.length) {
    parts.push(`PIP'S NOTES ABOUT THIS TRADER (what you've learned from past conversations; lines marked "trader" were written by them and override yours):
${notes.map(n => `- ${n.text}${n.source === "user" ? " (trader)" : ""}`).join("\n")}

Use these the way a coach who knows someone would: naturally, when relevant. Don't recite them or say "according to my notes". If the trader says something has changed, believe them.`)
  }
  if (patterns.length) {
    parts.push(`THEIR TRADING PATTERNS (computed from detected trades, last 30 days, before today):
${patterns.map(p => `- ${p}`).join("\n")}

Bring a pattern up when it's relevant to the moment (for example a re-entry right after a loss), framed as their own data, never as a prediction.`)
  }
  return parts.length ? parts.join("\n\n") : null
}

const notesSchema = z.object({
  notes: z.array(z.string()).describe("The complete, updated list of notes")
})

const NOTES_SYSTEM = `You maintain a short notebook for Pip, an AI trading-discipline coach, about one trader. Notes help Pip coach them over weeks.

Write notes that will still matter next week:
- what they trade, where and how (markets, platform, prop firm or evaluation, session times, style)
- goals and what they're working on
- recurring habits and triggers (revenge trading, FOMO, moving stops, overtrading, time of day)
- what helps them and how they like to be coached (tone, length)
- rules or commitments they've stated

Rules:
- Each note is one short sentence, at most ${NOTE_MAX_CHARS} characters, written about the trader ("Trades NQ on Topstep").
- Return the complete updated list (at most ${MAX_PIP_NOTES} notes): keep notes that are still true, merge duplicates, update anything that changed, drop what's outdated or trivial.
- Don't duplicate the trader's own notes.
- Never record account numbers, balances, exact dollar amounts, contact details, health information or anything about other people.
- Nothing worth keeping? Return the existing notes unchanged.
- Output JSON: {"notes": ["..."]}`

const clip = (text: string, max: number) => text.length > max ? text.slice(0, max - 1) + "…" : text

// Readable text for a stored message (chart analyses are stored as JSON)
function messageText(content: string): string {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === "object") {
      return `[Chart check] ${[parsed.headline, parsed.summary].filter(Boolean).join(": ")}`
    }
  } catch {}
  return content
}

// Updates Pip's notes from conversations since the last update. Cheap and rare
// by design: at most once every 20 hours per trader, only with at least 4 new
// messages from them, and only if memory is on. Safe to call on every message.
export async function maybeRefreshNotes(supabase: SupabaseClient, userId: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("memory_enabled, notes_refreshed_at")
      .eq("id", userId)
      .single()
    if (!profile || profile.memory_enabled === false) return
    const last = profile.notes_refreshed_at as string | null
    if (last && Date.now() - Date.parse(last) < REFRESH_EVERY_MS) return

    let countQuery = supabase.from("chat_messages").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("role", "user")
    if (last) countQuery = countQuery.gt("created_at", last)
    const { count } = await countQuery
    if ((count ?? 0) < MIN_NEW_MESSAGES) return

    // Claim this refresh so parallel requests don't run it twice
    const now = new Date().toISOString()
    let claim = supabase.from("profiles").update({ notes_refreshed_at: now }).eq("id", userId)
    claim = last ? claim.eq("notes_refreshed_at", last) : claim.is("notes_refreshed_at", null)
    const { data: claimed } = await claim.select("id")
    if (!claimed?.length) return

    let messagesQuery = supabase.from("chat_messages").select("role, content, created_at").eq("user_id", userId)
    if (last) messagesQuery = messagesQuery.gt("created_at", last)
    const { data: messages } = await messagesQuery.order("created_at", { ascending: false }).limit(MAX_MESSAGES_READ)
    if (!messages?.length) return

    const notes = await loadNotes(supabase, userId)
    const pipNotes = notes.filter(n => n.source === "pip")
    const userNotes = notes.filter(n => n.source === "user")
    const conversation = [...messages].reverse()
      .map(m => `${m.role === "user" ? "Trader" : "Pip"}: ${clip(messageText(String(m.content)), MESSAGE_MAX_CHARS)}`)
      .join("\n")

    const prompt = `Current notes (yours):
${pipNotes.length ? pipNotes.map(n => `- ${n.text}`).join("\n") : "(none yet)"}

The trader's own notes (keep as they are, don't repeat):
${userNotes.length ? userNotes.map(n => `- ${n.text}`).join("\n") : "(none)"}

New conversation since the last update:
${conversation}`

    const { output, tokens } = await smallJson({ system: NOTES_SYSTEM, prompt, schema: notesSchema, maxTokens: 1500 })
    await logLlmUsage(supabase, userId, "notes", tokens)

    const fresh = [...new Set(output.notes.map(n => clip(n.trim(), NOTE_MAX_CHARS)).filter(Boolean))].slice(0, MAX_PIP_NOTES)
    // Replace Pip's own notes; the trader's notes are never touched here
    const unchanged = fresh.length === pipNotes.length && fresh.every((text, i) => text === pipNotes[i]?.text)
    if (unchanged) return
    await supabase.from("pip_notes").delete().eq("user_id", userId).eq("source", "pip")
    if (fresh.length) {
      await supabase.from("pip_notes").insert(fresh.map(text => ({ user_id: userId, text, source: "pip", updated_at: now })))
    }
  } catch (error) {
    console.error("[Pip notes] Refresh failed:", error instanceof Error ? error.message : error)
  }
}
