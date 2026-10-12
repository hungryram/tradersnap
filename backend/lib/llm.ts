import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import OpenAI from "openai"
import sharp from "sharp"
import type { z } from "zod"
import type { LlmUsage as TokenUsage } from "./llm-cost"
import { isPaid } from "./plans"

// Provider layer for /api/analyze and /api/chat. Routes build prompts; this file
// owns which model runs them. Set AI_PROVIDER=anthropic to switch to Claude.
export type Provider = "openai" | "anthropic"
export const provider: Provider = process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "openai"

// Main model: chart analysis and rare judgment jobs (rules review). Opus reads charts best.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5"
// Model for chart analysis; set ANTHROPIC_ANALYZE_MODEL to try another model without touching the rest
const ANTHROPIC_ANALYZE_MODEL = process.env.ANTHROPIC_ANALYZE_MODEL || ANTHROPIC_MODEL
// Coaching chat. Short conversational replies don't need Opus; set ANTHROPIC_CHAT_MODEL=claude-opus-5-5 to go back
const ANTHROPIC_CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || "claude-sonnet-5-5"
// Model for free-tier chat, if it should differ from the chat model
const ANTHROPIC_MODEL_FREE = process.env.ANTHROPIC_MODEL_FREE || ANTHROPIC_CHAT_MODEL
// Thinking effort for chart analysis: higher is more careful but slower
const ANALYZE_EFFORT = (process.env.ANTHROPIC_ANALYZE_EFFORT || "medium") as "low" | "medium" | "high"
// Thinking effort for chat. Plain conversation doesn't need deep thinking, and
// thinking is billed as output (the most expensive tokens); a chart gets more.
const CHAT_EFFORT = (process.env.ANTHROPIC_CHAT_EFFORT || "low") as "low" | "medium" | "high"
const CHAT_IMAGE_EFFORT = (process.env.ANTHROPIC_CHAT_IMAGE_EFFORT || "medium") as "low" | "medium" | "high"
// Small, cheap model for background jobs like updating Pip's notes
const ANTHROPIC_SMALL_MODEL = process.env.ANTHROPIC_SMALL_MODEL || "claude-haiku-5-5"

// Opt into server-side refusal fallbacks: a declined request is re-run on the
// model Anthropic recommends for that refusal category instead of failing.
const FALLBACK_BETA = "server-side-fallback-2026-07-01"

// Opus/Sonnet 5-tier models read images up to 2576px on the long edge
const MAX_IMAGE_EDGE = 2576
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null
const openai = () => (openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }))
const anthropic = () => (anthropicClient ??= new Anthropic())

export type LlmUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}

export type ChatTurn = { role: "user" | "assistant"; content: string }

export type ChatResult = {
  text: string | null
  finishReason: "stop" | "length" | "refusal" | "other"
  model: string
  usage: LlmUsage | null
  // Detailed counts for cost tracking (lib/llm-cost)
  tokens: TokenUsage | null
}

export type AnalysisResult = { output: unknown; tokens: TokenUsage | null }

function anthropicTokens(response: { model: string; usage: Anthropic.Beta.BetaUsage }): TokenUsage {
  return {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    outputTokens: response.usage.output_tokens
  }
}

function openaiTokens(model: string, usage: OpenAI.CompletionUsage | undefined): TokenUsage | null {
  if (!usage) return null
  const cached = usage.prompt_tokens_details?.cached_tokens || 0
  return { model, inputTokens: usage.prompt_tokens - cached, cacheWriteTokens: 0, cacheReadTokens: cached, outputTokens: usage.completion_tokens }
}

const isPaidPlan = (plan?: string | null) => isPaid(plan)

// ---------------------------------------------------------------------------
// Chart analysis (structured JSON)
// ---------------------------------------------------------------------------

export async function analyzeChart(opts: {
  system: string
  image: string
  prompt: string
  schema: z.ZodType
  plan?: string | null
}): Promise<AnalysisResult> {
  if (provider === "anthropic") {
    const response = await anthropic().beta.messages.parse({
      model: ANTHROPIC_ANALYZE_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: {
        effort: ANALYZE_EFFORT,
        format: betaZodOutputFormat(opts.schema)
      },
      system: opts.system,
      messages: [{
        role: "user",
        content: [await toClaudeImage(opts.image), { type: "text", text: opts.prompt }]
      }]
    })

    if (response.stop_reason === "refusal") {
      throw new Error(`Analysis refused (${response.stop_details?.category ?? "unknown"})`)
    }
    if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
      throw new Error(`Analysis output incomplete (stop_reason: ${response.stop_reason})`)
    }
    return { output: response.parsed_output, tokens: anthropicTokens(response) }
  }

  // Use auto-res for free plan (~765 tokens, much better readability), high-res for pro (full detail)
  const completion = await openai().chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { role: "system", content: opts.system },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: opts.image, detail: isPaid(opts.plan) ? "high" : "auto" } },
          { type: "text", text: opts.prompt }
        ]
      }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500
  })

  return { output: JSON.parse(completion.choices[0].message.content || "{}"), tokens: openaiTokens("gpt-5.1", completion.usage) }
}

// ---------------------------------------------------------------------------
// Coaching chat (free text)
// ---------------------------------------------------------------------------

export async function chat(opts: {
  system: string
  // Per-user context that changes at most daily (saved messages, Pip's notes, trade patterns); cached
  memory?: string | null
  // Per-request context (current time); kept out of the cached prefix
  volatileContext?: string | null
  history: ChatTurn[]
  message: string
  image?: string | null
  plan?: string | null
  cacheKey: string
}): Promise<ChatResult> {
  if (provider === "anthropic") return chatAnthropic(opts)
  return chatOpenAI(opts)
}

async function chatAnthropic(opts: Parameters<typeof chat>[0]): Promise<ChatResult> {
  const model = isPaidPlan(opts.plan) ? ANTHROPIC_CHAT_MODEL : ANTHROPIC_MODEL_FREE

  // Cached prefix, most stable first. The system prompt and memory change at most
  // daily, so they're cached for an hour (trading sessions have long gaps between
  // messages); each is its own breakpoint so a memory update keeps the prompt cached.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: opts.system, cache_control: { type: "ephemeral", ttl: "1h" } }]
  if (opts.memory) system.push({ type: "text", text: opts.memory, cache_control: { type: "ephemeral", ttl: "1h" } })

  // Conversation must start with a user turn; skip empty turns
  const history = opts.history.filter(turn => turn.content.trim().length > 0)
  while (history.length > 0 && history[0].role !== "user") history.shift()

  const userContent: Anthropic.Beta.BetaContentBlockParam[] = []
  if (opts.image) userContent.push(await toClaudeImage(opts.image))
  userContent.push({ type: "text", text: opts.message })

  // The recent conversation is cached too (5 minutes): the next message re-sends it
  // at a fraction of the price while the trader keeps chatting
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((turn, i): Anthropic.Beta.BetaMessageParam => i === history.length - 1
      ? { role: turn.role, content: [{ type: "text", text: turn.content, cache_control: { type: "ephemeral" } }] }
      : { role: turn.role, content: turn.content }),
    { role: "user", content: userContent }
  ]
  // Operator context after the user turn, so it never invalidates the cached prefix
  if (opts.volatileContext) messages.push({ role: "system", content: opts.volatileContext })

  const response = await anthropic().beta.messages.create({
    model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: opts.image ? CHAT_IMAGE_EFFORT : CHAT_EFFORT },
    system,
    messages
  })

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map(block => block.text)
    .join("")
    .trim()

  const finishReason: ChatResult["finishReason"] =
    response.stop_reason === "refusal" ? "refusal"
    : response.stop_reason === "max_tokens" ? "length"
    : response.stop_reason === "end_turn" ? "stop"
    : "other"

  const cachedTokens = response.usage.cache_read_input_tokens ?? 0
  const inputTokens = response.usage.input_tokens + cachedTokens + (response.usage.cache_creation_input_tokens ?? 0)

  return {
    text: finishReason === "refusal" ? null : text || null,
    finishReason,
    model: response.model,
    usage: {
      inputTokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens,
      totalTokens: inputTokens + response.usage.output_tokens
    },
    tokens: anthropicTokens(response)
  }
}

async function chatOpenAI(opts: Parameters<typeof chat>[0]): Promise<ChatResult> {
  const messages: any[] = [{ role: "system", content: opts.system }]
  if (opts.volatileContext) messages.push({ role: "system", content: opts.volatileContext })
  if (opts.memory) messages.push({ role: "system", content: opts.memory })
  messages.push(...opts.history)

  if (opts.image) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: opts.message },
        { type: "image_url", image_url: { url: opts.image, detail: "high" } }
      ]
    })
  } else {
    messages.push({ role: "user", content: opts.message })
  }

  const model = isPaidPlan(opts.plan) ? "gpt-5.1" : "gpt-5-mini"
  const maxTokens = opts.plan === "admin" ? 4000 : isPaid(opts.plan) ? 3000 : 2000

  // Some models (like gpt-5-mini) don't support custom temperature
  const completionParams: any = {
    model,
    messages,
    max_completion_tokens: maxTokens,
    // Cache key based on user rules to group similar prompts together
    prompt_cache_key: opts.cacheKey
  }

  if (model === "gpt-5.1") {
    completionParams.temperature = 0.7
    // Extended prompt caching (24h retention) for Pro users
    completionParams.prompt_cache_retention = "24h"
  }

  const completion = await openai().chat.completions.create(completionParams)
  const choice = completion.choices[0]
  const usage = completion.usage

  return {
    text: choice?.message?.content || null,
    finishReason: choice?.finish_reason === "length" ? "length" : choice?.finish_reason === "stop" ? "stop" : "other",
    model,
    usage: usage ? {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
      totalTokens: usage.total_tokens
    } : null,
    tokens: openaiTokens(model, usage)
  }
}

// ---------------------------------------------------------------------------
// Small structured jobs (background, cheap model)
// ---------------------------------------------------------------------------

// A short piece of plain text from the small model, e.g. Pip's morning check-in
export async function smallText(opts: { system: string; prompt: string; maxTokens?: number }): Promise<{ text: string | null; tokens: TokenUsage | null; stop: string | null }> {
  if (provider === "anthropic") {
    const response = await anthropic().beta.messages.create({
      model: ANTHROPIC_SMALL_MODEL,
      max_tokens: opts.maxTokens ?? 400,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }]
    })
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map(block => block.text)
      .join("")
      .trim()
    const complete = response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence"
    return { text: complete && text ? text : null, tokens: anthropicTokens(response), stop: response.stop_reason }
  }

  const completion = await openai().chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }],
    // A reasoning model: keep reasoning minimal and leave room for it, or it can spend the budget and return nothing
    reasoning_effort: "minimal",
    max_completion_tokens: Math.max(1000, opts.maxTokens ?? 400)
  })
  const choice = completion.choices[0]
  return { text: choice?.finish_reason === "stop" ? choice.message.content?.trim() || null : null, tokens: openaiTokens("gpt-5-mini", completion.usage), stop: choice?.finish_reason ?? null }
}

// A structured answer from the main model, for jobs that need judgment but are
// rare (e.g. reviewing a trader's rules). Low effort keeps the cost down.
export async function mainJson<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number }): Promise<{ output: T; tokens: TokenUsage | null }> {
  if (provider === "anthropic") {
    const response = await anthropic().beta.messages.parse({
      model: ANTHROPIC_MODEL,
      max_tokens: opts.maxTokens ?? 6000,
      output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }]
    })
    if (response.parsed_output == null) throw new Error(`Output incomplete (stop_reason: ${response.stop_reason})`)
    return { output: response.parsed_output as T, tokens: anthropicTokens(response) }
  }

  const completion = await openai().chat.completions.create({
    model: "gpt-5.1",
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: opts.maxTokens ?? 6000
  })
  const output = opts.schema.parse(JSON.parse(completion.choices[0].message.content || "{}"))
  return { output, tokens: openaiTokens("gpt-5.1", completion.usage) }
}

// One short JSON answer from the small model, e.g. updating Pip's notes
export async function smallJson<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number }): Promise<{ output: T; tokens: TokenUsage | null }> {
  if (provider === "anthropic") {
    const response = await anthropic().beta.messages.parse({
      model: ANTHROPIC_SMALL_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      output_config: { format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }]
    })
    if (response.parsed_output == null) throw new Error(`Small model output incomplete (stop_reason: ${response.stop_reason})`)
    return { output: response.parsed_output as T, tokens: anthropicTokens(response) }
  }

  const completion = await openai().chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }],
    response_format: { type: "json_object" },
    reasoning_effort: "low",
    max_completion_tokens: Math.max(4000, opts.maxTokens ?? 2000)
  })
  const output = opts.schema.parse(JSON.parse(completion.choices[0].message.content || "{}"))
  return { output, tokens: openaiTokens("gpt-5-mini", completion.usage) }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Converts a data URL to a Claude image block, downscaling oversized screenshots
// (e.g. 4K/retina PNGs) to the model's maximum useful resolution.
async function toClaudeImage(dataUrl: string): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const comma = dataUrl.indexOf(",")
  const declaredType = dataUrl.slice(5, dataUrl.indexOf(";"))
  let mediaType: "image/png" | "image/jpeg" = declaredType === "image/png" ? "image/png" : "image/jpeg"
  let buffer: Buffer = Buffer.from(dataUrl.slice(comma + 1), "base64")

  const { width = 0, height = 0 } = await sharp(buffer).metadata()
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || buffer.length > MAX_IMAGE_BYTES) {
    buffer = await sharp(buffer)
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
    mediaType = "image/jpeg"
  }

  return { type: "image", source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") } }
}
