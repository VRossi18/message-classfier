import { Redis } from 'ioredis'
import { MessageEventSchema, type MessageEvent } from '../schemas/api.js'

const CHANNEL = 'imcr:events'

export interface EventBus {
  publish(event: MessageEvent): Promise<void>
  /** Registra um ouvinte; retorna a função que cancela o registro. */
  subscribe(listener: (event: MessageEvent) => void): Promise<() => void>
  close(): Promise<void>
}

/** Pub/sub em Redis: o worker publica e qualquer instância da API repassa via SSE. */
export function createRedisBus(redisUrl: string): EventBus {
  const pub = new Redis(redisUrl)
  const sub = new Redis(redisUrl)
  const listeners = new Set<(e: MessageEvent) => void>()
  let subscribed: Promise<unknown> | undefined

  sub.on('message', (_channel, payload) => {
    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    const parsed = MessageEventSchema.safeParse(json)
    if (!parsed.success) return
    for (const l of listeners) l(parsed.data)
  })

  return {
    async publish(event) {
      await pub.publish(CHANNEL, JSON.stringify(event))
    },
    async subscribe(listener) {
      subscribed ??= sub.subscribe(CHANNEL)
      await subscribed
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async close() {
      pub.disconnect()
      sub.disconnect()
    },
  }
}
