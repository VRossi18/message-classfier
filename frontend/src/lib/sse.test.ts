import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (ev: Event) => void
class FakeES {
  static last: FakeES
  handlers = new Map<string, Handler[]>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeES.last = this
  }
  addEventListener(t: string, h: Handler) {
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), h])
  }
  close() {
    this.closed = true
  }
  emit(t: string, data: string) {
    for (const h of this.handlers.get(t) ?? []) h({ data } as unknown as Event)
  }
}

const message = {
  id: '1', customerName: 'A', rawContent: 'x', assignedSector: null, sentiment: null,
  urgencyScore: null, confidenceScore: null, summary: null, suggestedAction: null,
  correctedSector: null, status: 'PENDING', createdAt: '2026-01-01T00:00:00Z', processedAt: null,
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeES)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('connectEvents (EventSource real)', () => {
  async function setup() {
    vi.stubEnv('VITE_USE_MOCKS', 'false')
    const { connectEvents, USE_MOCKS } = await import('./sse')
    expect(USE_MOCKS).toBe(false)
    const onEvent = vi.fn()
    const onStatus = vi.fn()
    const close = await connectEvents(onEvent, onStatus)
    return { onEvent, onStatus, close, es: FakeES.last }
  }

  it('abre em /api/events e reporta status', async () => {
    const { es, onStatus } = await setup()
    expect(es.url).toBe('/api/events')
    es.onopen?.()
    es.onerror?.()
    expect(onStatus.mock.calls).toEqual([[true], [false]])
  })

  it('entrega eventos válidos de ambos os tipos', async () => {
    const { es, onEvent } = await setup()
    es.emit('message.created', JSON.stringify({ type: 'message.created', message }))
    es.emit('message.updated', JSON.stringify({ type: 'message.updated', message: { ...message, status: 'PROCESSING' } }))
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent.mock.calls[1]![0].message.status).toBe('PROCESSING')
  })

  it('ignora evento com formato inválido', async () => {
    const { es, onEvent } = await setup()
    es.emit('message.created', JSON.stringify({ type: 'message.created', message: { id: 1 } }))
    es.emit('message.updated', JSON.stringify({ foo: 'bar' }))
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('close encerra o EventSource', async () => {
    const { es, close } = await setup()
    close()
    expect(es.closed).toBe(true)
  })
})

describe('connectEvents (mock)', () => {
  it('assina o simulador e anuncia conectado', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true')
    const { connectEvents } = await import('./sse')
    const sim = await import('@/mocks/simulator')
    vi.useFakeTimers()
    const onEvent = vi.fn()
    const onStatus = vi.fn()
    const off = await connectEvents(onEvent, onStatus)
    expect(onStatus).toHaveBeenCalledWith(true)
    sim.createMessage({ customerName: 'A', rawContent: 'oi' })
    expect(onEvent).toHaveBeenCalledTimes(1)
    off()
    sim.createMessage({ customerName: 'B', rawContent: 'oi' })
    expect(onEvent).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
