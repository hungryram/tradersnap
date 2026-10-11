import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { loadNotes, MAX_NOTES } from "@/lib/pip-notes"
import { loadTradePatterns } from "@/lib/trade-patterns"

// Pip's memory for the dashboard's Memory page: read, add, edit and delete notes,
// turn memory on or off, and see the trade patterns Pip uses.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7))
  return error ? null : user
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 })
const noteText = z.string().trim().min(1).max(160)

export async function GET(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return unauthorized()

  const params = request.nextUrl.searchParams
  const dayStartParam = params.get("dayStart")
  const dayStart = dayStartParam && !isNaN(Date.parse(dayStartParam)) ? new Date(dayStartParam) : new Date(Date.now() - 24 * 60 * 60 * 1000)

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("memory_enabled, notes_refreshed_at, trading_limits")
    .eq("id", user.id)
    .single()
  if (error) return NextResponse.json({ error: "Memory isn't set up yet", setupNeeded: true }, { status: 503 })

  const [notes, patterns] = await Promise.all([
    loadNotes(supabase, user.id),
    loadTradePatterns(supabase, user.id, dayStart, profile.trading_limits ?? null, params.get("tz") || undefined)
  ])
  return NextResponse.json({
    enabled: profile.memory_enabled !== false,
    refreshedAt: profile.notes_refreshed_at,
    notes,
    patterns
  })
}

// Add a note of your own
export async function POST(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return unauthorized()
  const parsed = z.object({ text: noteText }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Notes are 1 to 160 characters." }, { status: 400 })

  const { count } = await supabase.from("pip_notes").select("id", { count: "exact", head: true }).eq("user_id", user.id)
  if ((count ?? 0) >= MAX_NOTES) return NextResponse.json({ error: `Pip keeps up to ${MAX_NOTES} notes. Delete one first.` }, { status: 400 })

  const { data, error } = await supabase
    .from("pip_notes")
    .insert({ user_id: user.id, text: parsed.data.text, source: "user" })
    .select("id, text, source, updated_at")
    .single()
  if (error) return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 })
  return NextResponse.json({ note: data })
}

// Edit a note (it becomes yours, so Pip won't rewrite it) or turn memory on/off
export async function PATCH(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return unauthorized()
  const body = await request.json().catch(() => null)

  const toggle = z.object({ enabled: z.boolean() }).safeParse(body)
  if (toggle.success) {
    const { error } = await supabase.from("profiles").update({ memory_enabled: toggle.data.enabled }).eq("id", user.id)
    if (error) return NextResponse.json({ error: "Couldn't change the setting." }, { status: 500 })
    return NextResponse.json({ enabled: toggle.data.enabled })
  }

  const edit = z.object({ id: z.string().uuid(), text: noteText }).safeParse(body)
  if (!edit.success) return NextResponse.json({ error: "Notes are 1 to 160 characters." }, { status: 400 })
  const { data, error } = await supabase
    .from("pip_notes")
    .update({ text: edit.data.text, source: "user", updated_at: new Date().toISOString() })
    .eq("id", edit.data.id)
    .eq("user_id", user.id)
    .select("id, text, source, updated_at")
    .single()
  if (error || !data) return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 })
  return NextResponse.json({ note: data })
}

// Delete one note (?id=) or everything Pip remembers (?all=1)
export async function DELETE(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return unauthorized()
  const params = request.nextUrl.searchParams

  if (params.get("all") === "1") {
    const { error } = await supabase.from("pip_notes").delete().eq("user_id", user.id)
    if (error) return NextResponse.json({ error: "Couldn't delete your notes." }, { status: 500 })
    // Start fresh: only conversations after this point are used for new notes
    await supabase.from("profiles").update({ notes_refreshed_at: new Date().toISOString() }).eq("id", user.id)
    return NextResponse.json({ success: true })
  }

  const id = z.string().uuid().safeParse(params.get("id"))
  if (!id.success) return NextResponse.json({ error: "Missing note" }, { status: 400 })
  const { error } = await supabase.from("pip_notes").delete().eq("id", id.data).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: "Couldn't delete the note." }, { status: 500 })
  return NextResponse.json({ success: true })
}
