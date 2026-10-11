"use client"

import { useEffect, useState } from "react"
import { api, startOfLocalDay } from "@/lib/dashboard-data"
import Pip from "../../components/Pip"
import { Card, Loading, Notice, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../components/ui"

type Note = { id: string; text: string; source: "pip" | "user"; updated_at: string }
type Memory = { enabled: boolean; refreshedAt: string | null; notes: Note[]; patterns: string[] }

// What Pip remembers about you: his notes (editable), your own notes, and the
// patterns he sees in your trades. Everything here can be changed or deleted.
export default function MemoryPage() {
  const [memory, setMemory] = useState<Memory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    api<Memory>(`/api/notes?tz=${encodeURIComponent(tz)}&dayStart=${encodeURIComponent(startOfLocalDay().toISOString())}`)
      .then(setMemory)
      .catch(err => setError(err instanceof Error ? err.message : "Couldn't load your memory."))
  }
  useEffect(load, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  const addNote = () => run(async () => {
    const { note } = await api<{ note: Note }>("/api/notes", { method: "POST", body: JSON.stringify({ text: draft }) })
    setMemory(m => m && { ...m, notes: [note, ...m.notes] })
    setDraft("")
  })

  const saveEdit = () => run(async () => {
    if (!editing) return
    const { note } = await api<{ note: Note }>("/api/notes", { method: "PATCH", body: JSON.stringify(editing) })
    setMemory(m => m && { ...m, notes: m.notes.map(n => n.id === note.id ? note : n) })
    setEditing(null)
  })

  const remove = (id: string) => run(async () => {
    await api(`/api/notes?id=${id}`, { method: "DELETE" })
    setMemory(m => m && { ...m, notes: m.notes.filter(n => n.id !== id) })
  })

  const forgetAll = () => {
    if (!confirm("Delete everything Pip remembers about you? Pip will start fresh from your next conversations.")) return
    run(async () => {
      await api("/api/notes?all=1", { method: "DELETE" })
      setMemory(m => m && { ...m, notes: [] })
    })
  }

  const toggle = () => run(async () => {
    const { enabled } = await api<{ enabled: boolean }>("/api/notes", { method: "PATCH", body: JSON.stringify({ enabled: !memory?.enabled }) })
    setMemory(m => m && { ...m, enabled })
  })

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!memory) return <Loading />

  const pipNotes = memory.notes.filter(n => n.source === "pip")
  const yourNotes = memory.notes.filter(n => n.source === "user")

  return (
    <>
      <PageHeader
        title="What Pip remembers"
        subtitle="Pip keeps a few short notes about you so he can coach you like he knows you. You can change or delete anything here."
        actions={
          <button onClick={toggle} disabled={busy} className={buttonSecondary}>
            Memory: <span className={memory.enabled ? "text-brand-300" : "text-ink-muted"}>{memory.enabled ? "On" : "Off"}</span>
          </button>
        }
      />

      {!memory.enabled && (
        <div className="mb-6">
          <Notice tone="info">Memory is off. Pip won&apos;t write new notes or use the ones below. Turn it back on any time.</Notice>
        </div>
      )}
      {message && <div className="mb-6"><Notice tone="bad">{message}</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Pip's notes" action={memory.refreshedAt ? <span className="text-xs text-ink-muted">Updated {new Date(memory.refreshedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : undefined}>
            {pipNotes.length === 0 ? (
              <div className="flex items-center gap-4">
                <Pip size={44} mood="thinking" />
                <p className="text-sm text-ink-text">
                  Nothing yet. After you&apos;ve chatted with Pip for a bit, he writes down what&apos;s worth remembering, about once a day: what you trade, what
                  you&apos;re working on, what trips you up.
                </p>
              </div>
            ) : (
              <NoteList notes={pipNotes} editing={editing} setEditing={setEditing} onSave={saveEdit} onDelete={remove} busy={busy} />
            )}
            <p className="mt-4 text-xs text-ink-muted">Editing a note makes it yours, so Pip won&apos;t rewrite it.</p>
          </Card>

          <Card title="Your notes for Pip">
            <form
              onSubmit={e => { e.preventDefault(); if (draft.trim()) addNote() }}
              className="mb-4 flex gap-2"
            >
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={160}
                placeholder="e.g. I'm trying to stop trading after 11am"
                className={inputClass}
              />
              <button type="submit" disabled={busy || !draft.trim()} className={buttonPrimary}>Add</button>
            </form>
            {yourNotes.length === 0 ? (
              <p className="text-sm text-ink-muted">Tell Pip anything you want him to always keep in mind.</p>
            ) : (
              <NoteList notes={yourNotes} editing={editing} setEditing={setEditing} onSave={saveEdit} onDelete={remove} busy={busy} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="From your trades">
            {memory.patterns.length === 0 ? (
              <p className="text-sm text-ink-text">
                Once Pip has seen about 10 of your trades, he&apos;ll spot patterns here, like how your trades go right after a loss or which hour treats
                you worst. Worked out from your own trade history; no AI involved.
              </p>
            ) : (
              <ul className="space-y-3 text-sm text-ink-text">
                {memory.patterns.map(line => <li key={line} className="leading-relaxed">{line}</li>)}
              </ul>
            )}
            <p className="mt-4 text-xs text-ink-muted">Last 30 days, not counting today.</p>
          </Card>

          <Card title="Start over">
            <p className="mb-4 text-sm text-ink-text">Delete all of Pip&apos;s notes and yours. Your chats, rules and trades aren&apos;t affected.</p>
            <button onClick={forgetAll} disabled={busy || memory.notes.length === 0} className={buttonDanger}>Forget everything</button>
          </Card>
        </div>
      </div>
    </>
  )
}

function NoteList({ notes, editing, setEditing, onSave, onDelete, busy }: {
  notes: Note[]
  editing: { id: string; text: string } | null
  setEditing: (value: { id: string; text: string } | null) => void
  onSave: () => void
  onDelete: (id: string) => void
  busy: boolean
}) {
  return (
    <ul className="divide-y divide-ink-border">
      {notes.map(note => (
        <li key={note.id} className="py-2.5 first:pt-0 last:pb-0">
          {editing?.id === note.id ? (
            <form onSubmit={e => { e.preventDefault(); onSave() }} className="flex gap-2">
              <input value={editing.text} onChange={e => setEditing({ id: note.id, text: e.target.value })} maxLength={160} autoFocus className={inputClass} />
              <button type="submit" disabled={busy || !editing.text.trim()} className={buttonPrimary}>Save</button>
              <button type="button" onClick={() => setEditing(null)} className={buttonSecondary}>Cancel</button>
            </form>
          ) : (
            <div className="group flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed text-ink-body">{note.text}</p>
              <div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                <button onClick={() => setEditing({ id: note.id, text: note.text })} className="rounded px-2 py-0.5 text-xs text-ink-text hover:bg-ink-elevated">Edit</button>
                <button onClick={() => onDelete(note.id)} disabled={busy} className="rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/10">Delete</button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
