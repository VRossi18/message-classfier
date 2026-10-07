import { z } from 'zod'
import {
  MessageSchema,
  MetricsSchema,
  type CreateMessageInput,
  type Message,
  type Metrics,
  type Sector,
} from './schemas'

const BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Só declara JSON quando há corpo: o Fastify responde 400 a um POST sem corpo com
    // Content-Type: application/json (caso de resolver/reabrir, que não enviam nada).
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!res.ok) throw new Error(`Falha na requisição (${res.status})`)
  return schema.parse(await res.json())
}

export const api = {
  listMessages: (): Promise<Message[]> => request('/api/messages', z.array(MessageSchema)),
  createMessage: (input: CreateMessageInput): Promise<Message> =>
    request('/api/messages', MessageSchema, { method: 'POST', body: JSON.stringify(input) }),
  correctSector: (id: string, correctedSector: Sector): Promise<Message> =>
    request(`/api/messages/${id}/correction`, MessageSchema, {
      method: 'PATCH',
      body: JSON.stringify({ correctedSector }),
    }),
  resolveMessage: (id: string): Promise<Message> => request(`/api/messages/${id}/resolve`, MessageSchema, { method: 'POST' }),
  reopenMessage: (id: string): Promise<Message> => request(`/api/messages/${id}/reopen`, MessageSchema, { method: 'POST' }),
  getMetrics: (): Promise<Metrics> => request('/api/metrics', MetricsSchema),
  eventsUrl: () => `${BASE}/api/events`,
}
