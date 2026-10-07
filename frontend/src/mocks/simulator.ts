import { computeMetrics } from '@/lib/metrics'
import { DEFAULT_ACTION } from '@/lib/sectors'
import type { Message, MessageEvent, Sector, Sentiment } from '@/lib/schemas'

type Listener = (e: MessageEvent) => void

const messages: Message[] = []
const listeners = new Set<Listener>()

function emit(type: MessageEvent['type'], message: Message) {
  for (const l of listeners) l({ type, message: { ...message } })
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const listMessages = () => [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
export const getMetrics = () => computeMetrics(messages)

const RULES: { sector: Sector; words: RegExp }[] = [
  { sector: 'FINANCIAL', words: /boleto|fatura|cobra|reembolso|estorno|nota fiscal|pagamento|cart[aã]o/i },
  { sector: 'STOCK', words: /estoque|dispon[ií]vel|prazo|envio|entrega|galp[aã]o|remessa/i },
  { sector: 'SALES', words: /or[cç]amento|comprar|pedido|plano|upgrade|pre[cç]o/i },
  { sector: 'SUPPORT', words: /erro|bug|n[aã]o funciona|travou|login|senha|como (uso|fa[cç]o)|ajuda/i },
]

function classify(text: string) {
  const hit = RULES.find((r) => r.words.test(text))
  const caps = text.replace(/[^A-Za-zÀ-ú]/g, '')
  const shouting = caps.length > 8 && text.replace(/[^A-ZÀ-Ú]/g, '').length / caps.length > 0.6
  const critical = /processo|procon|cancel|absurdo|p[eé]ssimo|urgente|perdi|preju[ií]zo/i.test(text)
  const angry = shouting || critical || /rid[ií]culo|inaceit|lixo|nunca mais|!!/i.test(text)
  const sentiment: Sentiment = critical && angry ? 'CRITICAL' : angry ? 'ANGRY' : hit ? 'NEUTRAL' : 'CALM'
  const sector: Sector = hit?.sector ?? 'HUMAN_REVIEW'
  const urgency = sentiment === 'CRITICAL' ? 0.95 : sentiment === 'ANGRY' ? 0.75 : 0.25
  const confidence = hit ? 0.8 + Math.random() * 0.15 : 0.4
  return {
    sector,
    sentiment,
    urgencyScore: Math.round(urgency * 100) / 100,
    confidenceScore: Math.round(confidence * 100) / 100,
    summary: text.length > 80 ? `${text.slice(0, 77)}...` : text,
    suggestedAction: DEFAULT_ACTION[sentiment === 'CRITICAL' ? 'HUMAN_REVIEW' : sector],
  }
}

export function createMessage(input: { customerName: string; rawContent: string }): Message {
  const m: Message = {
    id: crypto.randomUUID(),
    customerName: input.customerName,
    rawContent: input.rawContent,
    assignedSector: null,
    sentiment: null,
    urgencyScore: null,
    confidenceScore: null,
    summary: null,
    suggestedAction: null,
    correctedSector: null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    processedAt: null,
  }
  messages.push(m)
  emit('message.created', m)

  setTimeout(() => {
    m.status = 'PROCESSING'
    emit('message.updated', m)
  }, 600)
  setTimeout(() => {
    const c = classify(m.rawContent)
    Object.assign(m, {
      assignedSector: c.sector,
      sentiment: c.sentiment,
      urgencyScore: c.urgencyScore,
      confidenceScore: c.confidenceScore,
      summary: c.summary,
      suggestedAction: c.suggestedAction,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
    } satisfies Partial<Message>)
    emit('message.updated', m)
  }, 1800 + Math.random() * 1200)
  return { ...m }
}

export function correctSector(id: string, sector: Sector): Message | null {
  const m = messages.find((x) => x.id === id)
  if (!m) return null
  m.correctedSector = sector
  emit('message.updated', m)
  return { ...m }
}
